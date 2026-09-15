// @vitest-environment node

/**
 * Pins the plan's "single writer" invariant for `Inbox.status`: every
 * channel-active/inactive transition should flow through the `Connection`
 * FSM (`ConnectionStateService.transition`'s `mirrorInboxStatus`), not a
 * bespoke direct `.update(inboxModel)` — otherwise `Connection.status` and
 * `Inbox.status` silently drift (see the messenger/instagram disconnect
 * billing bug this guard exists to catch a repeat of).
 *
 * Allow-listed exceptions, both pre-existing and intentional:
 *   - `connection/state-service.ts` — the one legitimate writer.
 *   - `inbox/service.ts` — the legacy `create`/`disconnect` API kept for
 *     every not-yet-migrated channel (telegram, zalo, whatsapp, tiktok,
 *     webchat, smtp, api); Phase 5 removes this exception.
 *   - `integration-context/auth-store.ts` — the pre-backfill fallback for
 *     an `Integration<Channel>` row with no `Connection` counterpart yet.
 *
 * A new match outside this list means a new bypass was just introduced —
 * route it through `connectionStateService`/`inboxService` instead of
 * widening the allow-list.
 */

import { readFileSync } from "node:fs"
import { glob } from "node:fs/promises"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"

const SRC_ROOT = resolve(import.meta.dirname, "../src")

const ALLOWED_WRITERS = new Set([
  "connection/state-service.ts",
  "inbox/service.ts",
  "integration-context/auth-store.ts",
])

const DIRECT_INBOX_UPDATE_REGEX = /\.update\(\s*inboxModel\s*\)/

describe("Inbox.status write guard", () => {
  test("only the allow-listed services write to inboxModel directly", async () => {
    const offenders: string[] = []

    for await (const entry of glob("**/*.ts", { cwd: SRC_ROOT })) {
      if (entry.endsWith(".test.ts")) {
        continue
      }
      const source = readFileSync(resolve(SRC_ROOT, entry), "utf8")
      if (
        DIRECT_INBOX_UPDATE_REGEX.test(source) &&
        !ALLOWED_WRITERS.has(entry)
      ) {
        offenders.push(entry)
      }
    }

    expect(offenders).toEqual([])
  })

  test("every allow-listed exception still exists and still writes inboxModel", () => {
    for (const relativePath of ALLOWED_WRITERS) {
      const source = readFileSync(resolve(SRC_ROOT, relativePath), "utf8")
      expect(DIRECT_INBOX_UPDATE_REGEX.test(source)).toBe(true)
    }
  })
})
