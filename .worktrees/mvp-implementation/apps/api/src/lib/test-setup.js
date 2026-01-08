// Set environment variables for tests
process.env.JWT_ACCESS_SECRET = 'dev-access-secret-please-change-in-production-min-32-chars-test'
process.env.JWT_REFRESH_SECRET = 'dev-refresh-secret-please-change-in-production-min-32-chars-test'
process.env.NODE_ENV = 'test'
