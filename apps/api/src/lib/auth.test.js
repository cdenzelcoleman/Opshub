import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, generateAccessToken, generateRefreshToken, verifyAccessToken } from './auth.js'

describe('Password utilities', () => {
  it('should hash password', async () => {
    const password = 'MySecurePass123'
    const hash = await hashPassword(password)

    expect(hash).toBeDefined()
    expect(hash).not.toBe(password)
    expect(hash.length).toBeGreaterThan(50)
  })

  it('should verify correct password', async () => {
    const password = 'MySecurePass123'
    const hash = await hashPassword(password)
    const isValid = await verifyPassword(password, hash)

    expect(isValid).toBe(true)
  })

  it('should reject incorrect password', async () => {
    const password = 'MySecurePass123'
    const hash = await hashPassword(password)
    const isValid = await verifyPassword('WrongPassword', hash)

    expect(isValid).toBe(false)
  })
})

describe('JWT utilities', () => {
  it('should generate access token', () => {
    const userId = 'user123'
    const token = generateAccessToken(userId)

    expect(token).toBeDefined()
    expect(typeof token).toBe('string')
  })

  it('should generate refresh token', () => {
    const userId = 'user123'
    const token = generateRefreshToken(userId)

    expect(token).toBeDefined()
    expect(typeof token).toBe('string')
  })

  it('should verify valid access token', () => {
    const userId = 'user123'
    const token = generateAccessToken(userId)
    const payload = verifyAccessToken(token)

    expect(payload.userId).toBe(userId)
  })

  it('should reject invalid access token', () => {
    expect(() => verifyAccessToken('invalid-token')).toThrow()
  })
})
