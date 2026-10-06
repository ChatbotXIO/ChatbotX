// @vitest-environment node

/**
 * M8 commit-deferral follow-up: `workspaceLifecycleService.disconnectWorkspaceChannels`
 * forwards a caller-owned `tx` all the way down to
 * `connectionStateService.transition`'s "teardown.pause"/"teardown.disconnect"
 * edges. Before this fix, a release-edge transition on that path released its
 * `channels` quota unit immediately once `transition` returned — even though
 * `tx` might be a transaction some caller further up still owns and does more
 * work in afterward. Releasing before that caller's transaction actually
 * commits risks under-counting the release on a later rollback.
 *
 * `disconnectWorkspaceChannels` now bubbles every deferred release up through
 * its own return value (`pendingReleases`) instead of releasing inline, so
 * only the transaction's actual owner ever decides when to release. This
 * suite drives that through the real `tx` plumbing against Postgres —
 * mocking `connectionStateService.transition` (as the sibling unit suite
 * does) could never observe a real premature release.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run with
 * `pnpm --filter @chatbotx.io/business test:db`.
 */

import {
  CONNECTION_STORE_BINDINGS,
  upsertConnectionRow,
} from "@chatbotx.io/business/connection"
import { db, eq } from "@chatbotx.io/database/client"
import {
  connectionModel,
  userModel,
  userQuotaModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { AuthType } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { describe, expect, test } from "vitest"
import { inboxService } from "../../src/inbox/service"
import { workspaceLifecycleService } from "../../src/workspace-lifecycle/service"

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

const webchatStore = CONNECTION_STORE_BINDINGS.webchat
if (!webchatStore) {
  throw new Error("webchat has no store binding registered")
}

/**
 * Committed (NOT rolled back) workspace + owner + unlimited `UserQuota` row —
 * `quotaEnforcementService`/`workspaceUsageService` resolve through the
 * shared `db` pool, never through a still-open fixture transaction, so the
 * owner/workspace rows must already be visible outside it.
 */
const seedCommittedWorkspace = async (): Promise<{
  ownerId: string
  workspaceId: string
}> => {
  const ownerId = createId()
  const workspaceId = createId()
  await db.insert(userModel).values({
    id: ownerId,
    email: `workspace-lifecycle-quota-${ownerId}@example.test`,
    name: "Workspace lifecycle quota test owner",
  })
  await db.insert(workspaceModel).values({
    id: workspaceId,
    ownerId,
    name: "Workspace lifecycle quota test workspace",
  })
  await db.insert(userQuotaModel).values({
    userId: ownerId,
    planName: "Workspace lifecycle quota test plan",
    planStatus: "active",
  })
  return { ownerId, workspaceId }
}

const cleanupCommittedWorkspace = async (input: {
  ownerId: string
  workspaceId: string
}): Promise<void> => {
  await db
    .delete(workspaceModel)
    .where(eq(workspaceModel.id, input.workspaceId))
  await db.delete(userModel).where(eq(userModel.id, input.ownerId))
}

describe.skipIf(!databaseUrl)(
  "disconnectWorkspaceChannels: deferred channels-quota release across a caller-owned transaction (M8 commit-deferral follow-up)",
  () => {
    test("a failure after transition() inside the caller's own transaction rolls back the status write and does not release channels quota", async () => {
      const { ownerId, workspaceId } = await seedCommittedWorkspace()
      try {
        const sourceId = createId()

        const connection = await db.transaction(async (tx) => {
          const { inbox } = await inboxService.create({
            data: {
              workspaceId,
              channel: "webchat",
              sourceId,
              name: "Test Webchat",
            },
            ownerId,
            tx,
            skipQuota: true,
          })
          return await upsertConnectionRow({
            tx,
            workspaceId,
            provider: "webchat",
            kind: "channel",
            descriptor: { sourceId, displayName: "Test Webchat" },
            auth: { authType: AuthType.custom },
            extraConfig: {
              brandColor: "#000000",
              authorizedDomains: [],
              conversationStarters: [],
              persistentMenus: [],
            },
            existing: undefined,
            store: webchatStore,
            ownerId,
            quotaConsumption: {
              consumed: false,
              workspaceUsageIncremented: false,
            },
            inboxId: inbox.id,
          })
        })

        expect(connection.status).toBe("connected")

        const [quotaAfterConnect] = await db
          .select()
          .from(userQuotaModel)
          .where(eq(userQuotaModel.userId, ownerId))
          .limit(1)
        expect(quotaAfterConnect?.channelsUsed).toBe(1)

        // Acts as the "caller" that owns a `db.transaction` and does more
        // work after `disconnectWorkspaceChannels` returns from it —
        // exactly the race this fix closes. Forcing the whole transaction
        // to fail here simulates that caller's own rollback.
        await expect(
          db.transaction(async (tx) => {
            await workspaceLifecycleService.disconnectWorkspaceChannels({
              workspaceId,
              ownerId,
              reason: "workspace_purge",
              teardownLevel: "disconnect",
              tx,
            })
            throw new Error("simulated caller rollback after transition")
          }),
        ).rejects.toThrow("simulated caller rollback after transition")

        const [connectionAfterRollback] = await db
          .select()
          .from(connectionModel)
          .where(eq(connectionModel.id, connection.id))
          .limit(1)
        // Postgres actually rolled back the whole transaction, including
        // the FSM status write `transition` made inside it.
        expect(connectionAfterRollback?.status).toBe("connected")

        const [quotaAfterRollback] = await db
          .select()
          .from(userQuotaModel)
          .where(eq(userQuotaModel.userId, ownerId))
          .limit(1)
        // The bug this test guards: releasing right after `transition`
        // returns (instead of bubbling it up for the caller to release
        // once its OWN transaction commits) would under-count here even
        // though nothing actually disconnected.
        expect(quotaAfterRollback?.channelsUsed).toBe(1)
      } finally {
        await cleanupCommittedWorkspace({ ownerId, workspaceId })
      }
    })
  },
)
