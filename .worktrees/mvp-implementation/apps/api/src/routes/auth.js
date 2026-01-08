import { Router } from 'express'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { prisma } from '../lib/prisma.js'
import { hashPassword, verifyPassword, generateAccessToken, generateRefreshToken, hashRefreshToken, verifyRefreshToken } from '../lib/auth.js'
import { ValidationError, UnauthorizedError } from '../middleware/errorHandler.js'
import { createAuditLog } from '../lib/audit.js'

const router = Router()

// Strict rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts'
})

// Validation schemas
const signupSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name required'),
  orgName: z.string().min(1, 'Organization name required')
})

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required')
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token required')
})

/**
 * POST /api/auth/signup
 * Create user and auto-create organization
 */
router.post('/signup', authLimiter, async (req, res, next) => {
  try {
    // Validate input
    const result = signupSchema.safeParse(req.body)
    if (!result.success) {
      throw new ValidationError('Validation failed', result.error.flatten().fieldErrors)
    }

    const { email, password, name, orgName } = result.data

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      throw new ValidationError('Email already registered')
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create user and org in transaction
    const txResult = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true
        }
      })

      // Create organization with slug
      const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const org = await tx.organization.create({
        data: {
          name: orgName,
          slug: `${slug}-${Date.now()}`
        }
      })

      // Create membership (user is OWNER)
      await tx.orgMembership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: 'OWNER'
        }
      })

      // Create audit log
      await createAuditLog({
        organizationId: org.id,
        userId: user.id,
        action: 'USER_SIGNUP',
        metadata: { email }
      })

      await createAuditLog({
        organizationId: org.id,
        userId: user.id,
        action: 'ORG_CREATED',
        metadata: { orgName }
      })

      return { user, org }
    })

    // Generate tokens
    const accessToken = generateAccessToken(txResult.user.id)
    const refreshToken = generateRefreshToken(txResult.user.id)

    // Store refresh token
    const tokenHash = await hashRefreshToken(refreshToken)
    await prisma.refreshToken.create({
      data: {
        userId: txResult.user.id,
        token: tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      }
    })

    res.status(201).json({
      data: {
        user: txResult.user,
        organization: txResult.org,
        accessToken,
        refreshToken
      }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    // Validate input
    const result = loginSchema.safeParse(req.body)
    if (!result.success) {
      throw new ValidationError('Validation failed', result.error.flatten().fieldErrors)
    }

    const { email, password } = result.data

    // Get user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            organization: true
          }
        }
      }
    })

    if (!user) {
      throw new UnauthorizedError('Invalid credentials')
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash)
    if (!isValid) {
      throw new UnauthorizedError('Invalid credentials')
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id)
    const refreshToken = generateRefreshToken(user.id)

    // Store refresh token
    const tokenHash = await hashRefreshToken(refreshToken)
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    })

    // Create audit log for all orgs
    for (const membership of user.memberships) {
      await createAuditLog({
        organizationId: membership.organizationId,
        userId: user.id,
        action: 'USER_LOGIN',
        metadata: { email }
      })
    }

    // Return user without password
    const { passwordHash, ...userWithoutPassword } = user

    res.json({
      data: {
        user: userWithoutPassword,
        accessToken,
        refreshToken
      }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    // Validate input
    const result = refreshSchema.safeParse(req.body)
    if (!result.success) {
      throw new ValidationError('Validation failed', result.error.flatten().fieldErrors)
    }

    const { refreshToken } = result.data

    // Verify token
    let payload
    try {
      payload = verifyRefreshToken(refreshToken)
    } catch (error) {
      throw new UnauthorizedError('Invalid refresh token')
    }

    // Check if token exists and not expired
    const tokenHash = await hashRefreshToken(refreshToken)
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: tokenHash }
    })

    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token expired')
    }

    // Generate new access token
    const accessToken = generateAccessToken(payload.userId)

    res.json({
      data: { accessToken }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/auth/logout
 * Logout and invalidate refresh token
 */
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body

    if (refreshToken) {
      const tokenHash = await hashRefreshToken(refreshToken)
      await prisma.refreshToken.deleteMany({
        where: { token: tokenHash }
      })
    }

    res.json({ data: { message: 'Logged out successfully' } })
  } catch (error) {
    next(error)
  }
})

export default router
