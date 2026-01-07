import { verifyAccessToken } from '../lib/auth.js'
import { prisma } from '../lib/prisma.js'
import { UnauthorizedError, ForbiddenError } from './errorHandler.js'

/**
 * Middleware: Verify JWT and attach user to request
 */
export async function authenticate(req, res, next) {
  try {
    // Get token from header
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided')
    }

    const token = authHeader.substring(7)

    // Verify token
    const payload = verifyAccessToken(token)

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true
      }
    })

    if (!user) {
      throw new UnauthorizedError('User not found')
    }

    // Attach user to request
    req.user = user

    next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      next(new UnauthorizedError('Invalid or expired token'))
    } else {
      next(error)
    }
  }
}

/**
 * Middleware: Verify user belongs to organization and attach membership
 */
export async function requireOrg(req, res, next) {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required')
    }

    // Get org ID from route params or header
    const orgId = req.params.orgId || req.headers['x-organization-id']

    if (!orgId) {
      throw new ForbiddenError('Organization ID required')
    }

    // Check membership
    const membership = await prisma.orgMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.user.id,
          organizationId: orgId
        }
      },
      include: {
        organization: true
      }
    })

    if (!membership) {
      throw new ForbiddenError('Access denied to this organization')
    }

    // Attach to request
    req.orgMembership = membership
    req.organization = membership.organization

    next()
  } catch (error) {
    next(error)
  }
}

/**
 * Middleware factory: Require specific role(s)
 */
export function requireRole(allowedRoles) {
  return (req, res, next) => {
    try {
      if (!req.orgMembership) {
        throw new ForbiddenError('Organization context required')
      }

      const userRole = req.orgMembership.role
      const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]

      if (!roles.includes(userRole)) {
        throw new ForbiddenError(`Requires one of: ${roles.join(', ')}`)
      }

      next()
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Helper: Check if user has specific role
 */
export function hasRole(membership, allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]
  return roles.includes(membership.role)
}
