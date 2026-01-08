import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { prisma } from '../lib/prisma.js'

describe('POST /api/auth/signup', () => {
  let app

  beforeAll(() => {
    app = createApp()
  })

  afterAll(async () => {
    // Clean up test data
    await prisma.user.deleteMany({
      where: { email: { contains: 'test-signup' } }
    })
  })

  it('should create user and organization', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send({
        email: 'test-signup@example.com',
        password: 'SecurePass123',
        name: 'Test User',
        orgName: 'Test Org'
      })
      .expect(201)

    expect(response.body.data).toHaveProperty('accessToken')
    expect(response.body.data).toHaveProperty('refreshToken')
    expect(response.body.data.user).toHaveProperty('id')
    expect(response.body.data.user.email).toBe('test-signup@example.com')
    expect(response.body.data).toHaveProperty('organization')
  })

  it('should reject duplicate email', async () => {
    // Create user first
    await request(app)
      .post('/api/auth/signup')
      .send({
        email: 'test-signup-dup@example.com',
        password: 'SecurePass123',
        name: 'Test User',
        orgName: 'Test Org'
      })

    // Try to create again
    const response = await request(app)
      .post('/api/auth/signup')
      .send({
        email: 'test-signup-dup@example.com',
        password: 'SecurePass123',
        name: 'Test User 2',
        orgName: 'Test Org 2'
      })
      .expect(400)

    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('should validate required fields', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'test@example.com' })
      .expect(400)

    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('POST /api/auth/login', () => {
  let app
  const testUser = {
    email: 'test-login@example.com',
    password: 'SecurePass123',
    name: 'Test User',
    orgName: 'Test Org'
  }

  beforeAll(async () => {
    app = createApp()
    // Create test user
    await request(app).post('/api/auth/signup').send(testUser)
  })

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: testUser.email }
    })
  })

  it('should login with correct credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      })
      .expect(200)

    expect(response.body.data).toHaveProperty('accessToken')
    expect(response.body.data).toHaveProperty('refreshToken')
    expect(response.body.data.user.email).toBe(testUser.email)
  })

  it('should reject incorrect password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: 'WrongPassword'
      })
      .expect(401)

    expect(response.body.error.code).toBe('UNAUTHORIZED')
  })

  it('should reject non-existent user', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'Password123'
      })
      .expect(401)

    expect(response.body.error.code).toBe('UNAUTHORIZED')
  })
})
