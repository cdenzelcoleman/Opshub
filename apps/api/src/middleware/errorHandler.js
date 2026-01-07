import { logger } from '../lib/logger.js'

export class AppError extends Error {
  constructor(message, status = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED')
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN')
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, 'NOT_FOUND')
  }
}

export function errorHandler(err, req, res, next) {
  const status = err.status || 500
  const code = err.code || 'INTERNAL_ERROR'
  const message = err.message || 'Internal server error'

  // Log error
  if (status >= 500) {
    logger.error({ err, req: { method: req.method, url: req.url } }, 'Request error')
  } else {
    logger.warn({ err, req: { method: req.method, url: req.url } }, 'Request error')
  }

  // Send response
  res.status(status).json({
    error: {
      message,
      code,
      ...(err.details && { details: err.details })
    }
  })
}
