/**
 * Set safe default environment variables BEFORE any module under test imports
 * its env validator. Many packages in this monorepo read env vars at module
 * load time (e.g. `packages/database/src/keys.ts` initialises a pg Pool from
 * `DATABASE_URL`). Without these defaults, importing such packages in a test
 * would either crash or attempt a real network connection.
 *
 * Tests can override any value by writing to `process.env` inside their own
 * setup before importing the module under test.
 */

const TEST_DEFAULTS: Readonly<Record<string, string>> = {
  NODE_ENV: "test",

  // App environment
  NEXT_PUBLIC_ENVIRONMENT: "test",
  NEXT_PUBLIC_EDITION: "community",

  // Database — non-routable host so accidental real connections fail fast
  DATABASE_URL:
    "postgresql://test:test@127.0.0.1:1/chatbotx_test?schema=public",

  // Redis — same fail-fast idea
  REDIS_URL: "redis://127.0.0.1:1",

  // S3
  S3_ACCESS_KEY_ID: "test",
  S3_BUCKET: "test",
  S3_REGION: "us-west-2",
  S3_SECRET_ACCESS_KEY: "test",
  S3_ENPOINT: "http://127.0.0.1:1",

  // Better Auth
  BETTER_AUTH_SECRET: "test-secret-32-bytes-padding-padding=",
  BETTER_AUTH_URL: "http://localhost:3123",

  // Next.js public
  NEXT_PUBLIC_ASSET_URL: "http://localhost:9000/chatbotx/",
  NEXT_PUBLIC_BUILDER_URL: "http://localhost:3123",
  NEXT_PUBLIC_REALTIME_URL: "http://localhost:1999",
  NEXT_PUBLIC_SMTP_FROM: "test@localhost",

  // Realtime
  REALTIME_SESSION_VERIFY_URL: "http://localhost:3123",
  REALTIME_BROADCAST_SECRET: "test-broadcast-secret",

  // SMTP
  SMTP_SERVER: "smtp://test:test@127.0.0.1:1",

  // Scheduler
  SCHEDULER_BUCKET_RANGE: "0-255",

  // Logging
  LOG_LEVEL: "silent",

  // Encryption — 32-byte hex test key
  ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
}

for (const [key, value] of Object.entries(TEST_DEFAULTS)) {
  if (process.env[key] === undefined) {
    process.env[key] = value
  }
}
