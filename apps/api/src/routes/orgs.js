import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireOrg, requireRole } from '../middleware/auth.js'
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js'
import { createAuditLog } from '../lib/audit.js'

const router = Router()

// All routes require authentication
router.use(authenticate)

/**
 * GET /api/orgs
 * List user's organizations
 */
router.get('/', async (req, res, next) => {
  try {
    const memberships = await prisma.orgMembership.findMany({
      where: { userId: req.user.id },
      include: {
        organization: true
      },
      orderBy: { joinedAt: 'desc' }
    })

    res.json({
      data: memberships.map(m => ({
        ...m.organization,
        role: m.role,
        joinedAt: m.joinedAt
      }))
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/orgs
 * Create new organization
 */
router.post('/', async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1, 'Organization name required')
    })

    const result = schema.safeParse(req.body)
    if (!result.success) {
      throw new ValidationError('Validation failed', result.error.flatten().fieldErrors)
    }

    const { name } = result.data

    // Create org and membership
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const org = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name,
          slug: `${slug}-${Date.now()}`
        }
      })

      await tx.orgMembership.create({
        data: {
          userId: req.user.id,
          organizationId: org.id,
          role: 'OWNER'
        }
      })

      await createAuditLog({
        organizationId: org.id,
        userId: req.user.id,
        action: 'ORG_CREATED',
        metadata: { name }
      })

      return org
    })

    res.status(201).json({ data: org })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/orgs/:orgId
 * Get organization details
 */
router.get('/:orgId', requireOrg, async (req, res, next) => {
  try {
    res.json({ data: req.organization })
  } catch (error) {
    next(error)
  }
})

/**
 * PATCH /api/orgs/:orgId
 * Update organization (OWNER only)
 */
router.patch('/:orgId', requireOrg, requireRole('OWNER'), async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).optional()
    })

    const result = schema.safeParse(req.body)
    if (!result.success) {
      throw new ValidationError('Validation failed', result.error.flatten().fieldErrors)
    }

    const org = await prisma.organization.update({
      where: { id: req.params.orgId },
      data: result.data
    })

    res.json({ data: org })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/orgs/:orgId/members
 * List organization members
 */
router.get('/:orgId/members', requireOrg, async (req, res, next) => {
  try {
    const members = await prisma.orgMembership.findMany({
      where: { organizationId: req.params.orgId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true
          }
        }
      },
      orderBy: { joinedAt: 'asc' }
    })

    res.json({
      data: members.map(m => ({
        ...m.user,
        role: m.role,
        joinedAt: m.joinedAt,
        membershipId: m.id
      }))
    })
  } catch (error) {
    next(error)
  }
})

/**
 * PATCH /api/orgs/:orgId/members/:userId
 * Change member role (OWNER only)
 */
router.patch('/:orgId/members/:userId', requireOrg, requireRole('OWNER'), async (req, res, next) => {
  try {
    const schema = z.object({
      role: z.enum(['OWNER', 'ADMIN', 'AGENT', 'VIEWER'])
    })

    const result = schema.safeParse(req.body)
    if (!result.success) {
      throw new ValidationError('Validation failed', result.error.flatten().fieldErrors)
    }

    const membership = await prisma.orgMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.params.userId,
          organizationId: req.params.orgId
        }
      }
    })

    if (!membership) {
      throw new NotFoundError('Membership not found')
    }

    const oldRole = membership.role
    const updated = await prisma.orgMembership.update({
      where: { id: membership.id },
      data: { role: result.data.role }
    })

    await createAuditLog({
      organizationId: req.params.orgId,
      userId: req.user.id,
      action: 'ROLE_CHANGED',
      metadata: {
        targetUserId: req.params.userId,
        oldRole,
        newRole: result.data.role
      }
    })

    res.json({ data: updated })
  } catch (error) {
    next(error)
  }
})

/**
 * DELETE /api/orgs/:orgId/members/:userId
 * Remove member (ADMIN+)
 */
router.delete('/:orgId/members/:userId', requireOrg, requireRole(['OWNER', 'ADMIN']), async (req, res, next) => {
  try {
    // Can't remove yourself if you're the only OWNER
    if (req.params.userId === req.user.id) {
      const ownerCount = await prisma.orgMembership.count({
        where: {
          organizationId: req.params.orgId,
          role: 'OWNER'
        }
      })

      if (ownerCount === 1) {
        throw new ValidationError('Cannot remove the only owner')
      }
    }

    await prisma.orgMembership.delete({
      where: {
        userId_organizationId: {
          userId: req.params.userId,
          organizationId: req.params.orgId
        }
      }
    })

    await createAuditLog({
      organizationId: req.params.orgId,
      userId: req.user.id,
      action: 'MEMBER_REMOVED',
      metadata: { removedUserId: req.params.userId }
    })

    res.json({ data: { message: 'Member removed' } })
  } catch (error) {
    next(error)
  }
})

export default router
