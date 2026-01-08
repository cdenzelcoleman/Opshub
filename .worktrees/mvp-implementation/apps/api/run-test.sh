#!/bin/bash
cd /Users/cdenzelcoleman/code/Opshub/.worktrees/mvp-implementation/apps/api
export NODE_ENV=test
export JWT_ACCESS_SECRET="dev-access-secret-please-change-in-production-min-32-chars"
export JWT_REFRESH_SECRET="dev-refresh-secret-please-change-in-production-min-32-chars"
pnpm exec vitest run src/lib/auth.test.js
