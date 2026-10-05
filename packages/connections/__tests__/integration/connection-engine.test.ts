// @vitest-environment node

/**
 * Phase 0 (plan: "Rà soát Connection (v1.11.0 → origin/main) + chuyển lưu
 * trữ sang bảng `Connection`"): real-Postgres coverage for every edge of
 * the `Connection` state machine (`@chatbotx.io/business/connection`'s
 * `state.ts`) driven through the actual engine entry points
 * (`upsertConnectionRow`, `connectionStateService.transition`,
 * `lifecycle.disconnect`) — not a mocked `connectionRepository`.
 *
 * Before the Phase 1 fixes this suite guards, every one of these edges
 * violated a real CHECK constraint on first contact with Postgres
 * (`Connection_status_reason_check`: `(status = 'connected') = (statusReason
 * IS NULL)`; `Connection_disconnectedAt_check`: `(status = 'disconnected') =
 * (disconnectedAt IS NOT NULL)`), because `upsertConnectionRow`'s insert and
 * `ConnectionStateService.transition`'s write computed those two columns
 * inconsistently with `status`. `packages/connections/__tests__/service.test.ts`
 * and `packages/business/src/connection/__tests__/state-service.test.ts`
 * both stub `connectionRepository` entirely, so neither could ever observe
 * a real constraint violation — this file is the gap.
 *
 * Every case uses `kind: "integration"` (the `claude` credential provider):
 * it has no `integration`/`webhook` adapter fields, so `lifecycle.disconnect`
 * never makes a network call, and `integration`-kind connections never touch
 * the `channels` quota/Redis path (`quotaEdge` only moves `channels` quota
 * for `kind === "channel"` — see `state-service.ts`'s `transition`). This
 * file is a pure state-machine x Postgres-constraint cross product, not a
 * quota test — channel-kind quota consumption is covered by the mocked
 * suites above plus `state.test.ts`'s pure FSM unit tests.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run with
 * `pnpm --filter @chatbotx.io/connections test:db`.
 */

import { connectionStateService } from "@chatbotx.io/business/connection"
import type { DatabaseClient } from "@chatbotx.io/database/client"
import { db, eq } from "@chatbotx.io/database/client"
import {
  connectionModel,
  integrationModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import type { ConnectionModel } from "@chatbotx.io/database/types"
import { AuthType, type SecretTextAuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { describe, expect, test } from "vitest"
import { upsertConnectionRow } from "../../src/internal"
import { disconnect } from "../../src/lifecycle"
import { CONNECTION_REGISTRY } from "../../src/registry"

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

const claudeStore = CONNECTION_REGISTRY.claude.store
if (!claudeStore) {
  throw new Error("claude has no store binding registered")
}

/** Thrown at the end of a fixture transaction so it never commits. */
class RollbackSignal extends Error {}

const withRolledBackTransaction = async (
  fn: (tx: DatabaseClient) => Promise<void>,
): Promise<void> => {
  try {
    await db.transaction(async (tx) => {
      await fn(tx)
      throw new RollbackSignal()
    })
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      throw error
    }
  }
}

const seedWorkspace = async (tx: DatabaseClient): Promise<string> => {
  const ownerId = createId()
  const workspaceId = createId()
  await tx.insert(userModel).values({
    id: ownerId,
    email: `connection-engine-${ownerId}@example.test`,
    name: "Connection engine test owner",
  })
  await tx.insert(workspaceModel).values({
    id: workspaceId,
    ownerId,
    name: "Connection engine test workspace",
  })
  return workspaceId
}

const testAuth: SecretTextAuthValue = {
  authType: AuthType.secretText,
  secretText: "test-api-key",
}

const insertNewClaudeConnection = (
  tx: DatabaseClient,
  workspaceId: string,
): Promise<ConnectionModel> =>
  upsertConnectionRow({
    tx,
    workspaceId,
    provider: "claude",
    kind: "integration",
    descriptor: { sourceId: "workspace", displayName: "Claude" },
    auth: testAuth,
    extraConfig: {},
    existing: undefined,
    store: claudeStore,
    ownerId: undefined,
    quotaConsumption: { consumed: false, workspaceUsageIncremented: false },
  })

const loadConnection = async (
  tx: DatabaseClient,
  id: string,
): Promise<ConnectionModel> => {
  const [row] = await tx
    .select()
    .from(connectionModel)
    .where(eq(connectionModel.id, id))
    .limit(1)
  if (!row) {
    throw new Error("Connection row not found")
  }
  return row
}

describe.skipIf(!databaseUrl)(
  "Connection engine FSM edges against Postgres",
  () => {
    test("insert mới: upsertConnectionRow's insert satisfies every CHECK constraint and lands on connected", () =>
      withRolledBackTransaction(async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const created = await insertNewClaudeConnection(tx, workspaceId)

        expect(created.status).toBe("connected")
        expect(created.statusReason).toBeNull()
        expect(created.disconnectedAt).toBeNull()
        expect(created.connectedAt).not.toBeNull()
      }))

    test("revive từ disconnected: upsertConnectionRow's existing-branch update does not violate the status/statusReason CHECK mid-transaction", () =>
      withRolledBackTransaction(async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const created = await insertNewClaudeConnection(tx, workspaceId)
        await connectionStateService.transition({
          connectionId: created.id,
          event: "user.disconnect",
          tx,
        })
        const existing = await loadConnection(tx, created.id)
        expect(existing.status).toBe("disconnected")

        const revived = await upsertConnectionRow({
          tx,
          workspaceId,
          provider: "claude",
          kind: "integration",
          descriptor: { sourceId: "workspace", displayName: "Claude" },
          auth: testAuth,
          extraConfig: {},
          existing,
          store: claudeStore,
          ownerId: undefined,
          quotaConsumption: {
            consumed: false,
            workspaceUsageIncremented: false,
          },
        })

        expect(revived.status).toBe("connected")
        expect(revived.statusReason).toBeNull()
        expect(revived.disconnectedAt).toBeNull()
      }))

    test("revive từ degraded: connect.completed restores connected without a CHECK violation", () =>
      withRolledBackTransaction(async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const created = await insertNewClaudeConnection(tx, workspaceId)
        await connectionStateService.transition({
          connectionId: created.id,
          event: "refresh.transient_failure",
          reason: "refresh_failed",
          tx,
        })
        const degraded = await loadConnection(tx, created.id)
        expect(degraded.status).toBe("degraded")

        const restored = await connectionStateService.transition({
          connectionId: created.id,
          event: "connect.completed",
          tx,
        })

        expect(restored.status).toBe("connected")
        expect(restored.statusReason).toBeNull()
      }))

    test.each([
      { event: "auth.revoked", reason: "token_revoked", to: "needs_reauth" },
      { event: "teardown.pause", reason: "trial_expired", to: "paused" },
      { event: "user.disconnect", reason: "manual", to: "disconnected" },
    ] as const)("connected → $to via $event satisfies the status/statusReason/disconnectedAt CHECKs", ({
      event,
      reason,
      to,
    }) =>
      withRolledBackTransaction(async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const created = await insertNewClaudeConnection(tx, workspaceId)

        const result = await connectionStateService.transition({
          connectionId: created.id,
          event,
          reason,
          tx,
        })

        expect(result.status).toBe(to)
        expect(result.statusReason).toBe(reason)
        if (to === "disconnected") {
          expect(result.disconnectedAt).not.toBeNull()
        } else {
          expect(result.disconnectedAt).toBeNull()
        }
      }))

    test("needs_reauth → disconnected via teardown.disconnect satisfies the CHECK constraints", () =>
      withRolledBackTransaction(async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const created = await insertNewClaudeConnection(tx, workspaceId)
        await connectionStateService.transition({
          connectionId: created.id,
          event: "auth.revoked",
          reason: "token_revoked",
          tx,
        })

        const result = await connectionStateService.transition({
          connectionId: created.id,
          event: "teardown.disconnect",
          reason: "workspace_purge",
          tx,
        })

        expect(result.status).toBe("disconnected")
        expect(result.statusReason).toBe("workspace_purge")
        expect(result.disconnectedAt).not.toBeNull()
      }))

    test("disconnected → connected via connect.completed revives without a CHECK violation", () =>
      withRolledBackTransaction(async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const created = await insertNewClaudeConnection(tx, workspaceId)
        await connectionStateService.transition({
          connectionId: created.id,
          event: "user.disconnect",
          tx,
        })

        const result = await connectionStateService.transition({
          connectionId: created.id,
          event: "connect.completed",
          tx,
        })

        expect(result.status).toBe("connected")
        expect(result.statusReason).toBeNull()
        expect(result.disconnectedAt).toBeNull()
      }))

    test("disconnect integration-kind: deleting the parent Integration row cascades the Connection row instead of throwing ConnectionNotFoundException", async () => {
      // Its own committed fixture, not the shared rolled-back transaction:
      // `lifecycle.disconnect` opens its own `db.transaction` internally and
      // must see the seeded rows from a separate connection.
      const ownerId = createId()
      const workspaceId = createId()
      await db.insert(userModel).values({
        id: ownerId,
        email: `connection-engine-disconnect-${ownerId}@example.test`,
        name: "Connection engine disconnect test owner",
      })
      await db.insert(workspaceModel).values({
        id: workspaceId,
        ownerId,
        name: "Connection engine disconnect test workspace",
      })
      try {
        const created = await db.transaction((tx) =>
          insertNewClaudeConnection(tx, workspaceId),
        )

        const result = await disconnect({
          connectionId: created.id,
          workspaceId,
        })
        expect(result.status).toBe("disconnected")

        const [connectionRow] = await db
          .select()
          .from(connectionModel)
          .where(eq(connectionModel.id, created.id))
          .limit(1)
        expect(connectionRow).toBeUndefined()

        const [integrationRow] = await db
          .select()
          .from(integrationModel)
          .where(eq(integrationModel.workspaceId, workspaceId))
          .limit(1)
        expect(integrationRow).toBeUndefined()
      } finally {
        await db
          .delete(workspaceModel)
          .where(eq(workspaceModel.id, workspaceId))
        await db.delete(userModel).where(eq(userModel.id, ownerId))
      }
    })
  },
)
