import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import pinoHttp from 'pino-http'
import { logger } from './lib/logger.js'
import { errorHandler } from './middleware/errorHandler.js'
import authRoutes from './routes/auth.js'

export function createApp() {
  const app = express()

  // Request logging
  app.use(pinoHttp({ logger }))

  // Security headers
  app.use(helmet())

  // CORS
  app.use(
    cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true
    })
  )

  // Body parsing
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))

  // Global rate limiting
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100,
      message: 'Too many requests from this IP'
    })
  )

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // API routes will be added here
  app.get('/api', (req, res) => {
    res.json({ message: 'Ops Hub API' })
  })

  // Auth routes
  app.use('/api/auth', authRoutes)

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } })
  })

  // Error handler (must be last)
  app.use(errorHandler)

  return app
}
