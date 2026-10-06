// @vitest-environment node

/**
 * `UserQuotaService`'s private `countWorkspaceScopedUsage` previously derived
 * `channelsUsed` from a raw `Inbox ⋈ workspace` count — every `Inbox` row
 * under the owner's workspaces, regardless of whether a real active
 * `Connection` backs it. That over-counts: an `Inbox` can exist with no
 * `Connection` row at all (orphaned, e.g. pre-backfill or a failed connect),
 * or with a `Connection` that is `paused`/`needs_reauth`/`disconnected` (no
 * longer holding a channel-quota slot by the `Connection` state machine's own
 * `quotaEdge` rules — see `connection/state.ts`). This asserts
 * `reconcileUserSelfUsage` now counts distinct `Connection` rows matching
 * `kind = "channel" AND status IN ("connected", "degraded")`, scoped to the
 * owner, instead.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/business test:db`.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  connectionModel,
  inboxModel,
  userModel,
  userQuotaModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { userQuotaService } from "../../src/user-quota/service"

/** The shared Vitest preset uses a non-routable port so DB suites self-skip. */
const realDatabaseUrl = (): string | null => {
  const url = process.env.DATABASE_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === "1" ? null : url
  } catch {
    return null
  }
}

const databaseUrl = realDatabaseUrl()

const ownerId = createId()
const workspaceId = createId()

describe.skipIf(!databaseUrl)(
  "UserQuotaService channelsUsed counts active channel Connections, not raw Inbox rows",
  () => {
    beforeAll(async () => {
      await db.insert(userModel).values({
        id: ownerId,
        email: `channel-count-${ownerId}@example.test`,
        name: "Channel count test owner",
      })
      await db.insert(workspaceModel).values({
        id: workspaceId,
        ownerId,
        name: "Channel count test workspace",
      })

      // 1. A connected channel Connection — the only row that should count.
      const [connectedInbox] = await db
        .insert(inboxModel)
        .values({
          workspaceId,
          channel: "messenger",
          sourceId: createId(),
          name: "Connected inbox",
          status: "connected",
        })
        .returning()
      if (!connectedInbox) {
        throw new Error("Failed to insert connected inbox fixture")
      }
      await db.insert(connectionModel).values({
        workspaceId,
        provider: "messenger",
        kind: "channel",
        channel: "messenger",
        inboxId: connectedInbox.id,
        sourceId: createId(),
        displayName: "Connected connection",
        status: "connected",
      })

      // 2. A paused channel Connection — must not count.
      const [pausedInbox] = await db
        .insert(inboxModel)
        .values({
          workspaceId,
          channel: "whatsapp",
          sourceId: createId(),
          name: "Paused inbox",
          status: "disconnected",
        })
        .returning()
      if (!pausedInbox) {
        throw new Error("Failed to insert paused inbox fixture")
      }
      await db.insert(connectionModel).values({
        workspaceId,
        provider: "whatsapp",
        kind: "channel",
        channel: "whatsapp",
        inboxId: pausedInbox.id,
        sourceId: createId(),
        displayName: "Paused connection",
        status: "paused",
        statusReason: "trial_expired",
      })

      // 3. An Inbox whose Connection is a non-active channel status
      // (disconnected) — must not count.
      const [disconnectedInbox] = await db
        .insert(inboxModel)
        .values({
          workspaceId,
          channel: "instagram",
          sourceId: createId(),
          name: "Disconnected inbox",
          status: "disconnected",
        })
        .returning()
      if (!disconnectedInbox) {
        throw new Error("Failed to insert disconnected inbox fixture")
      }
      await db.insert(connectionModel).values({
        workspaceId,
        provider: "instagram",
        kind: "channel",
        channel: "instagram",
        inboxId: disconnectedInbox.id,
        sourceId: createId(),
        displayName: "Disconnected connection",
        status: "disconnected",
        statusReason: "manual",
        disconnectedAt: new Date(),
      })

      // 4. An orphan Inbox with no Connection row at all — must not count.
      await db.insert(inboxModel).values({
        workspaceId,
        channel: "telegram",
        sourceId: createId(),
        name: "Orphan inbox",
        status: "connected",
      })
    })

    afterAll(async () => {
      await db
        .delete(connectionModel)
        .where(eq(connectionModel.workspaceId, workspaceId))
      await db.delete(inboxModel).where(eq(inboxModel.workspaceId, workspaceId))
      await db.delete(userQuotaModel).where(eq(userQuotaModel.userId, ownerId))
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, ownerId))
    })

    test("reconcileUserSelfUsage persists channelsUsed = 1, not the Inbox row count of 4", async () => {
      await userQuotaService.reconcileUserSelfUsage(ownerId)

      const [row] = await db
        .select({ channelsUsed: userQuotaModel.channelsUsed })
        .from(userQuotaModel)
        .where(eq(userQuotaModel.userId, ownerId))
        .limit(1)

      expect(row?.channelsUsed).toBe(1)
    })
  },
)
