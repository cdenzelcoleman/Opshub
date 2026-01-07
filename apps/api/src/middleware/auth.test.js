import { describe, it, expect, vi, beforeEach } from 'vitest'
import { requireRole, hasRole } from './auth.js'
import { ForbiddenError } from './errorHandler.js'

describe('auth middleware', () => {
  describe('requireRole', () => {
    let req, res, next

    beforeEach(() => {
      req = {
        orgMembership: {
          id: 'mem123',
          userId: 'user123',
          organizationId: 'org123',
          role: 'ADMIN'
        }
      }
      res = {}
      next = vi.fn()
    })

    it('should allow user with required role', () => {
      const middleware = requireRole('ADMIN')
      middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
    })

    it('should allow user with one of multiple required roles', () => {
      const middleware = requireRole(['OWNER', 'ADMIN'])
      middleware(req, res, next)

      expect(next).toHaveBeenCalledWith()
    })

    it('should reject user without required role', () => {
      req.orgMembership.role = 'VIEWER'
      const middleware = requireRole('ADMIN')
      middleware(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError))
    })

    it('should reject when orgMembership is missing', () => {
      delete req.orgMembership
      const middleware = requireRole('ADMIN')
      middleware(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError))
    })
  })

  describe('hasRole', () => {
    it('should return true for matching role', () => {
      const membership = { role: 'ADMIN' }
      expect(hasRole(membership, 'ADMIN')).toBe(true)
    })

    it('should return true for matching role in array', () => {
      const membership = { role: 'ADMIN' }
      expect(hasRole(membership, ['OWNER', 'ADMIN'])).toBe(true)
    })

    it('should return false for non-matching role', () => {
      const membership = { role: 'VIEWER' }
      expect(hasRole(membership, 'ADMIN')).toBe(false)
    })

    it('should return false for non-matching role in array', () => {
      const membership = { role: 'AGENT' }
      expect(hasRole(membership, ['OWNER', 'ADMIN'])).toBe(false)
    })
  })
})
