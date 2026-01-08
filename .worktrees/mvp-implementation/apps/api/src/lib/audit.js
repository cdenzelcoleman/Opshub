import { prisma } from './prisma.js'
import { logger } from './logger.js'

/**
 * Create audit log entry
 */
export async function createAuditLog({ organizationId, userId, action, ticketId = null, metadata = {} }) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action,
        ticketId,
        metadata
      }
    })
  } catch (error) {
    // Don't fail the request if audit logging fails
    logger.error({ error, organizationId, userId, action }, 'Failed to create audit log')
  }
}
