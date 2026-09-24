/** The `setup-env` sentinel: a real database never listens on port 1. */
const NON_ROUTABLE_PORT = "1"

/**
 * `DATABASE_URL` when it points at a reachable database, else `null` so a
 * database-backed suite can `describe.skipIf(!databaseUrl)` itself under plain
 * `pnpm test` (the vitest preset pins the URL to the non-routable sentinel).
 */
export function realDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === NON_ROUTABLE_PORT ? null : url
  } catch {
    return null
  }
}
