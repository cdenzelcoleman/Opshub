import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireOrg, requireRole, hasRole } from '../middleware/auth.js'
import { ValidationError, NotFoundError, ForbiddenError } from '../middleware/errorHandler.js'
import { createAuditLog } from '../lib/audit.js'

const router = Router()

// All routes require authentication
router.use(authenticate)

/**
 * Helper: Validate status transitions
 */
function validateStatusTransition(currentStatus, newStatus, userRole) {
  // Define valid transitions based on role
  const transitionRules = {
    OPEN: ['PENDING_APPROVAL', 'IN_PROGRESS', 'CLOSED'],
    PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'OPEN'],
    APPROVED: ['IN_PROGRESS', 'CLOSED'],
    IN_PROGRESS: ['RESOLVED', 'CLOSED'],
    RESOLVED: ['CLOSED'],
    CLOSED: []
  }

  const validTransitions = transitionRules[currentStatus] || []

  // VIEWER role cannot change status
  if (userRole === 'VIEWER') {
    throw new ForbiddenError('Viewers cannot change ticket status')
  }

  // Check if transition is valid
  if (!validTransitions.includes(newStatus)) {
    throw new ValidationError(
      `Cannot transition from ${currentStatus} to ${newStatus}`,
      { currentStatus, newStatus, validTransitions }
    )
  }

  return true
}

/**
 * GET /api/orgs/:orgId/tickets
 * List tickets with filtering and pagination
 */
router.get('/:orgId/tickets', requireOrg, async (req, res, next) => {
  try {
    const schema = z.object({
      status: z.enum(['OPEN', 'PENDING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
      assigneeId: z.string().optional(),
      creatorId: z.string().optional(),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(100).default(10)
    })

    const result = schema.safeParse(req.query)
    if (!result.success) {
      throw new ValidationError('Validation failed', result.error.flatten().fieldErrors)
    }

    const { status, assigneeId, creatorId, page, limit } = result.data
    const skip = (page - 1) * limit

    // Build where clause
    const where = {
      organizationId: req.params.orgId
    }

    if (status) where.status = status
    if (assigneeId) where.assigneeId = assigneeId
    if (creatorId) where.creatorId = creatorId

    // Get tickets
    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        creator: {
          select: { id: true, name: true, email: true }
        },
        assignee: {
          select: { id: true, name: true, email: true }
        },
        approver: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    })

    // Get total count
    const total = await prisma.ticket.count({ where })

    res.json({
      data: tickets,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/orgs/:orgId/tickets
 * Create new ticket
 */
router.post('/:orgId/tickets', requireOrg, async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().min(1, 'Title required').max(255),
      description: z.string().min(1, 'Description required'),
      assigneeId: z.string().optional(),
      requiresApproval: z.boolean().default(false)
    })

    const result = schema.safeParse(req.body)
    if (!result.success) {
      throw new ValidationError('Validation failed', result.error.flatten().fieldErrors)
    }

    const { title, description, assigneeId, requiresApproval } = result.data

    // If assigneeId provided, verify it's a valid member
    if (assigneeId) {
      const assignee = await prisma.orgMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: assigneeId,
            organizationId: req.params.orgId
          }
        }
      })

      if (!assignee) {
        throw new ValidationError('Assignee is not a member of this organization')
      }
    }

    // Create ticket
    const ticket = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.create({
        data: {
          title,
          description,
          organizationId: req.params.orgId,
          creatorId: req.user.id,
          assigneeId,
          requiresApproval,
          status: 'OPEN'
        },
        include: {
          creator: {
            select: { id: true, name: true, email: true }
          },
          assignee: {
            select: { id: true, name: true, email: true }
          },
          approver: {
            select: { id: true, name: true, email: true }
          }
        }
      })

      await createAuditLog({
        organizationId: req.params.orgId,
        userId: req.user.id,
        ticketId: ticket.id,
        action: 'TICKET_CREATED',
        metadata: { title, requiresApproval, assigneeId }
      })

      return ticket
    })

    res.status(201).json({ data: ticket })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/orgs/:orgId/tickets/:ticketId
 * Get ticket details
 */
router.get('/:orgId/tickets/:ticketId', requireOrg, async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      include: {
        creator: {
          select: { id: true, name: true, email: true }
        },
        assignee: {
          select: { id: true, name: true, email: true }
        },
        approver: {
          select: { id: true, name: true, email: true }
        },
        attachments: {
          select: {
            id: true,
            filename: true,
            mimeType: true,
            size: true,
            uploadedAt: true,
            uploadedBy: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    })

    if (!ticket) {
      throw new NotFoundError('Ticket not found')
    }

    // Verify ticket belongs to the organization
    if (ticket.organizationId !== req.params.orgId) {
      throw new ForbiddenError('Access denied to this ticket')
    }

    res.json({ data: ticket })
  } catch (error) {
    next(error)
  }
})

/**
 * PATCH /api/orgs/:orgId/tickets/:ticketId
 * Update ticket with status transition validation
 */
router.patch('/:orgId/tickets/:ticketId', requireOrg, async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(255).optional(),
      description: z.string().min(1).optional(),
      status: z.enum(['OPEN', 'PENDING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
      assigneeId: z.string().optional().nullable(),
      requiresApproval: z.boolean().optional()
    })

    const result = schema.safeParse(req.body)
    if (!result.success) {
      throw new ValidationError('Validation failed', result.error.flatten().fieldErrors)
    }

    // Get current ticket
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId }
    })

    if (!ticket) {
      throw new NotFoundError('Ticket not found')
    }

    // Verify ticket belongs to the organization
    if (ticket.organizationId !== req.params.orgId) {
      throw new ForbiddenError('Access denied to this ticket')
    }

    const updateData = {}
    const metadata = {}

    // Only OWNER/ADMIN can update title and description
    if (result.data.title || result.data.description) {
      if (!hasRole(req.orgMembership, ['OWNER', 'ADMIN'])) {
        throw new ForbiddenError('Only admins can update ticket title/description')
      }
      if (result.data.title) {
        updateData.title = result.data.title
        metadata.oldTitle = ticket.title
        metadata.newTitle = result.data.title
      }
      if (result.data.description) {
        updateData.description = result.data.description
        metadata.oldDescription = ticket.description
        metadata.newDescription = result.data.description
      }
    }

    // Handle status transition
    if (result.data.status && result.data.status !== ticket.status) {
      validateStatusTransition(ticket.status, result.data.status, req.orgMembership.role)
      updateData.status = result.data.status
      metadata.oldStatus = ticket.status
      metadata.newStatus = result.data.status

      // Set resolved/closed timestamps
      if (result.data.status === 'RESOLVED' && !ticket.resolvedAt) {
        updateData.resolvedAt = new Date()
      }
      if (result.data.status === 'CLOSED' && !ticket.closedAt) {
        updateData.closedAt = new Date()
      }
    }

    // Handle assignee change
    if ('assigneeId' in result.data) {
      const newAssigneeId = result.data.assigneeId

      if (newAssigneeId) {
        // Verify assignee is a valid member
        const assignee = await prisma.orgMembership.findUnique({
          where: {
            userId_organizationId: {
              userId: newAssigneeId,
              organizationId: req.params.orgId
            }
          }
        })

        if (!assignee) {
          throw new ValidationError('Assignee is not a member of this organization')
        }
      }

      if (newAssigneeId !== ticket.assigneeId) {
        updateData.assigneeId = newAssigneeId
        metadata.oldAssigneeId = ticket.assigneeId
        metadata.newAssigneeId = newAssigneeId
      }
    }

    // Handle requiresApproval
    if (typeof result.data.requiresApproval === 'boolean') {
      if (result.data.requiresApproval !== ticket.requiresApproval) {
        updateData.requiresApproval = result.data.requiresApproval
        metadata.oldRequiresApproval = ticket.requiresApproval
        metadata.newRequiresApproval = result.data.requiresApproval
      }
    }

    // If no changes, return current ticket
    if (Object.keys(updateData).length === 0) {
      return res.json({ data: ticket })
    }

    // Update ticket
    const updatedTicket = await prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({
        where: { id: req.params.ticketId },
        data: updateData,
        include: {
          creator: {
            select: { id: true, name: true, email: true }
          },
          assignee: {
            select: { id: true, name: true, email: true }
          },
          approver: {
            select: { id: true, name: true, email: true }
          }
        }
      })

      // Create audit log with appropriate action
      let action = 'TICKET_UPDATED'
      if (metadata.oldStatus) {
        action = 'STATUS_CHANGED'
      }

      await createAuditLog({
        organizationId: req.params.orgId,
        userId: req.user.id,
        ticketId: req.params.ticketId,
        action,
        metadata
      })

      return updated
    })

    res.json({ data: updatedTicket })
  } catch (error) {
    next(error)
  }
})

/**
 * DELETE /api/orgs/:orgId/tickets/:ticketId
 * Delete ticket (OWNER/ADMIN only)
 */
router.delete('/:orgId/tickets/:ticketId', requireOrg, requireRole(['OWNER', 'ADMIN']), async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId }
    })

    if (!ticket) {
      throw new NotFoundError('Ticket not found')
    }

    // Verify ticket belongs to the organization
    if (ticket.organizationId !== req.params.orgId) {
      throw new ForbiddenError('Access denied to this ticket')
    }

    // Delete ticket (cascade will handle attachments and audit logs)
    await prisma.$transaction(async (tx) => {
      await tx.ticket.delete({
        where: { id: req.params.ticketId }
      })

      await createAuditLog({
        organizationId: req.params.orgId,
        userId: req.user.id,
        ticketId: req.params.ticketId,
        action: 'TICKET_UPDATED',
        metadata: { action: 'deleted', title: ticket.title }
      })
    })

    res.json({ data: { message: 'Ticket deleted' } })
  } catch (error) {
    next(error)
  }
})

export default router
