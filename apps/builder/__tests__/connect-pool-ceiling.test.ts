// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  CONNECT_CHANNEL_REGISTRY,
  CONNECT_CONCURRENCY,
  CONNECT_PICKER_CHANNELS,
} from "@/features/channel-connect/lib/registry"

/**
 * The pool `max` is read out of the source rather than imported: importing
 * `@chatbotx.io/database/client` constructs a real `pg.Pool` and validates
 * `DATABASE_URL` at module load, which a unit test must not do. `max` is
 * sourced from `DATABASE_POOL_MAX` (see `packages/database/src/keys.ts`),
 * so read its zod default instead of a numeric literal in `client.ts` —
 * if someone lowers the default, this test fails instead of silently going
 * stale.
 */
const POOL_MAX_DEFAULT_REGEX = /DATABASE_POOL_MAX:.*\.default\((\d+)\)/

function poolMax(): number {
  const keys = readFileSync(
    join(process.cwd(), "../../packages/database/src/keys.ts"),
    "utf8",
  )
  const match = keys.match(POOL_MAX_DEFAULT_REGEX)
  if (!match?.[1]) {
    throw new Error(
      "Could not read the DATABASE_POOL_MAX default from packages/database",
    )
  }
  return Number(match[1])
}

/**
 * Each in-flight connect holds two pooled connections at its peak — its own
 * transaction, plus the one the quota/usage/tenant writes take on `db` from
 * inside it. Concurrency is therefore capped by the pool, not only by Meta's
 * rate limits, and the failure mode is a `connectionTimeoutMillis` error
 * rather than a queue.
 */
describe("connect concurrency against the database pool", () => {
  test("two connections per in-flight connect still leave headroom", () => {
    expect(2 * CONNECT_CONCURRENCY + 2).toBeLessThanOrEqual(poolMax())
  })

  test("no channel is tuned above the shared ceiling", () => {
    for (const channel of CONNECT_PICKER_CHANNELS) {
      const { concurrency } = CONNECT_CHANNEL_REGISTRY[channel]

      expect(concurrency).toBeGreaterThanOrEqual(1)
      expect(concurrency).toBeLessThanOrEqual(CONNECT_CONCURRENCY)
      expect(2 * concurrency + 2).toBeLessThanOrEqual(poolMax())
    }
  })
})
