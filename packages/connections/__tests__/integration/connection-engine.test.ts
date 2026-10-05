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

import { inboxService } from "@chatbotx.io/business"
import { connectSessionService } from "@chatbotx.io/business/connect-session"
import {
  connectionStateService,
  toChannelType,
} from "@chatbotx.io/business/connection"
import type { DatabaseClient } from "@chatbotx.io/database/client"
import { db, eq } from "@chatbotx.io/database/client"
import {
  connectionModel,
  inboxModel,
  integrationModel,
  userModel,
  userQuotaModel,
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import type { ConnectionModel } from "@chatbotx.io/database/types"
import { encryptUtils } from "@chatbotx.io/encryption"
import {
  AuthType,
  type AuthValue,
  type SecretTextAuthValue,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { describe, expect, test, vi } from "vitest"
import { connectTargets } from "../../src/connect-targets"
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

type ChannelFixtureProvider =
  | "instagram"
  | "messenger"
  | "telegram"
  | "threads"
  | "webchat"

/**
 * Committed (NOT rolled back) workspace + owner fixture, required whenever
 * the exercised path touches `quotaEnforcementService`: `tryConsume`/
 * `release` resolve their `UserQuota` row and tenant context through the
 * shared `db` pool, never through whatever `tx` the caller happens to be
 * inside — a user/workspace row only visible inside
 * `withRolledBackTransaction`'s still-open transaction is invisible to that
 * connection, so `UserQuota.userId`'s foreign key would reject the write
 * instead of exercising the real consume/release path. Every channel-kind
 * quota case below therefore seeds and tears down its own committed
 * fixture instead of reusing `withRolledBackTransaction`.
 *
 * Also stamps an explicit, unlimited `UserQuota` row (`planStatus: "active"`,
 * every limit `null`) up front: `userQuotaService.getForUser` only overlays
 * the shared environment's real `entitlements:default-plan` Redis snapshot
 * (a ROOT-tenant "Trial" plan with `channelsLimit: 0` on this dev stack) when
 * NO row exists yet or its `planStatus` is `null` — without this, a brand
 * new test user would be gated at zero channels by whatever plan the
 * environment happens to have published, making the quota assertions below
 * depend on mutable external state instead of this fixture.
 */
const seedCommittedWorkspace = async (
  withOwnerMembership: boolean,
): Promise<{ ownerId: string; workspaceId: string }> => {
  const ownerId = createId()
  const workspaceId = createId()
  await db.insert(userModel).values({
    id: ownerId,
    email: `connection-engine-channel-${ownerId}@example.test`,
    name: "Connection engine channel test owner",
  })
  await db.insert(workspaceModel).values({
    id: workspaceId,
    ownerId,
    name: "Connection engine channel test workspace",
  })
  await db.insert(userQuotaModel).values({
    userId: ownerId,
    planName: "Connection engine test plan",
    planStatus: "active",
  })
  // Only `connectTargets` (via `resolveOwnerId` -> `workspaceMemberService
  // .findOwnerUserIdByWorkspaceId`) resolves the owner through a
  // `WorkspaceMember` row; the direct `upsertConnectionRow` cases pass
  // `ownerId` themselves and never query it.
  if (withOwnerMembership) {
    await db.insert(workspaceMemberModel).values({
      id: createId(),
      workspaceId,
      userId: ownerId,
      role: "owner",
    })
  }
  return { ownerId, workspaceId }
}

/** `Workspace`/`User` cascade (`onDelete: "cascade"`) onto `WorkspaceMember`, `Inbox`, `Connection`, every channel satellite table, and `UserQuota` — deleting these two rows is enough to clean up a whole committed fixture. */
const cleanupCommittedWorkspace = async (input: {
  ownerId: string
  workspaceId: string
}): Promise<void> => {
  await db
    .delete(workspaceModel)
    .where(eq(workspaceModel.id, input.workspaceId))
  await db.delete(userModel).where(eq(userModel.id, input.ownerId))
}

/**
 * One `kind: "channel"` fixture per Phase 0 item 1/3 provider
 * (messenger/instagram/telegram/webchat) — just enough of a real
 * `AuthValue` and satellite `extraConfig` to satisfy every NOT NULL column
 * `insertRow` doesn't fill itself (`IntegrationInstagram.pageId`/
 * `.username`, `IntegrationWebchat.brandColor`), without a real OAuth round
 * trip. `describe()` is never invoked on the direct `upsertConnectionRow`
 * path (only `connectCandidate`/`connectFromCredentials` call it), so
 * `auth` and `descriptor` only need to agree with EACH OTHER here, not
 * with what the real provider's `describe()` would derive — `connectTargets`
 * (item 3, below) DOES call `describe()`, which is why `auth`'s own
 * `metadata.pageId`/`metadata.igId` is seeded from the same `sourceId`.
 */
const CHANNEL_FIXTURES: ReadonlyArray<{
  provider: ChannelFixtureProvider
  auth: (sourceId: string) => AuthValue
  displayName: string
  extraConfig: Record<string, unknown>
}> = [
  {
    provider: "messenger",
    auth: (sourceId) => ({
      authType: AuthType.oauth2,
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUrl: "https://example.test/callback",
      tokens: { accessToken: "test-access-token" },
      metadata: { pageId: sourceId, pageName: "Test Page", version: "v18.0" },
    }),
    displayName: "Test Messenger Page",
    extraConfig: {},
  },
  {
    provider: "instagram",
    auth: (sourceId) => ({
      authType: AuthType.oauth2,
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUrl: "https://example.test/callback",
      tokens: { accessToken: "test-access-token" },
      metadata: {
        igId: sourceId,
        igName: "Test IG",
        pageId: `fb-${sourceId}`,
        version: "v18.0",
        username: "ig_test_user",
      },
    }),
    displayName: "Test Instagram Account",
    extraConfig: { pageId: "fb-page-test", username: "ig_test_user" },
  },
  {
    provider: "telegram",
    auth: (sourceId) => ({
      authType: AuthType.secretText,
      secretText: `${sourceId}:test-telegram-token`,
    }),
    displayName: "Test Telegram Bot",
    extraConfig: {},
  },
  {
    provider: "threads",
    auth: (sourceId) => ({
      authType: AuthType.oauth2,
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUrl: "https://example.test/callback",
      tokens: { accessToken: "test-access-token" },
      metadata: {
        threadsUserId: sourceId,
        username: "threads_test_user",
        version: "v1.0",
      },
    }),
    displayName: "Test Threads Account",
    extraConfig: { username: "threads_test_user" },
  },
  {
    provider: "webchat",
    auth: () => ({ authType: AuthType.custom }),
    displayName: "Test Webchat",
    // `authorizedDomains`/`conversationStarters`/`persistentMenus` declare a
    // `.default(sql\`[]\`)` in the schema, but — same drizzle-kit gap
    // `connect-session.ts`'s schema docstring calls out — that `sql` default
    // never made it into the physical column, so a bare insert NOT
    // supplying them violates their NOT NULL constraint.
    extraConfig: {
      brandColor: "#000000",
      authorizedDomains: [],
      conversationStarters: [],
      persistentMenus: [],
    },
  },
]

const storeFor = (provider: ChannelFixtureProvider) => {
  const store = CONNECTION_REGISTRY[provider].store
  if (!store) {
    throw new Error(`${provider} has no store binding registered`)
  }
  return store
}

/**
 * A `kind: "channel"` Connection already at `disconnected`, inserted
 * directly (bypassing `upsertConnectionRow`/the FSM) so the
 * quotaConsumption-guard case below never touches
 * `quotaEnforcementService` — only `connectionStateService.transition`'s
 * guard check, which fires before any quota call, and so can safely run
 * inside `withRolledBackTransaction`.
 */
const insertDisconnectedChannelConnection = async (
  tx: DatabaseClient,
  workspaceId: string,
  provider: ChannelFixtureProvider,
): Promise<ConnectionModel> => {
  const [inbox] = await tx
    .insert(inboxModel)
    .values({
      workspaceId,
      channel: toChannelType(provider),
      sourceId: createId(),
      name: "Guard test inbox",
    })
    .returning()
  const [created] = await tx
    .insert(connectionModel)
    .values({
      workspaceId,
      provider,
      kind: "channel",
      channel: toChannelType(provider),
      inboxId: inbox.id,
      sourceId: createId(),
      displayName: "Guard test connection",
      status: "disconnected",
      statusReason: "manual",
      disconnectedAt: new Date(),
    })
    .returning()
  return created
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

describe.skipIf(!databaseUrl)(
  "Channel-kind Connection lifecycle against Postgres (Phase 0 item 1)",
  () => {
    test.each(
      CHANNEL_FIXTURES,
    )("$provider: fresh connect consumes channels quota and mirrors Inbox as connected; user.disconnect releases quota and mirrors Inbox as disconnected", async (fixture) => {
      const { ownerId, workspaceId } = await seedCommittedWorkspace(false)
      try {
        const store = storeFor(fixture.provider)
        const sourceId = createId()

        const { connection, inboxId } = await db.transaction(async (tx) => {
          const { inbox } = await inboxService.create({
            data: {
              workspaceId,
              channel: toChannelType(fixture.provider),
              sourceId,
              name: fixture.displayName,
            },
            ownerId,
            tx,
            skipQuota: true,
          })
          const result = await upsertConnectionRow({
            tx,
            workspaceId,
            provider: fixture.provider,
            kind: "channel",
            descriptor: { sourceId, displayName: fixture.displayName },
            auth: fixture.auth(sourceId),
            extraConfig: fixture.extraConfig,
            existing: undefined,
            store,
            ownerId,
            quotaConsumption: {
              consumed: false,
              workspaceUsageIncremented: false,
            },
            inboxId: inbox.id,
          })
          return { connection: result, inboxId: inbox.id }
        })

        expect(connection.status).toBe("connected")
        expect(connection.statusReason).toBeNull()
        expect(connection.disconnectedAt).toBeNull()

        const [inboxAfterConnect] = await db
          .select()
          .from(inboxModel)
          .where(eq(inboxModel.id, inboxId))
          .limit(1)
        expect(inboxAfterConnect?.status).toBe("connected")
        expect(inboxAfterConnect?.disconnectReason).toBeNull()

        const [quotaAfterConnect] = await db
          .select()
          .from(userQuotaModel)
          .where(eq(userQuotaModel.userId, ownerId))
          .limit(1)
        expect(quotaAfterConnect?.channelsUsed).toBe(1)

        const disconnected = await connectionStateService.transition({
          connectionId: connection.id,
          event: "user.disconnect",
          ownerId,
        })

        expect(disconnected.status).toBe("disconnected")
        expect(disconnected.statusReason).toBe("manual")
        expect(disconnected.disconnectedAt).not.toBeNull()

        const [inboxAfterDisconnect] = await db
          .select()
          .from(inboxModel)
          .where(eq(inboxModel.id, inboxId))
          .limit(1)
        expect(inboxAfterDisconnect?.status).toBe("disconnected")
        expect(inboxAfterDisconnect?.disconnectReason).toBe("manual")

        const [quotaAfterDisconnect] = await db
          .select()
          .from(userQuotaModel)
          .where(eq(userQuotaModel.userId, ownerId))
          .limit(1)
        expect(quotaAfterDisconnect?.channelsUsed).toBe(0)
      } finally {
        await cleanupCommittedWorkspace({ ownerId, workspaceId })
      }
    })
  },
)

describe.skipIf(!databaseUrl)(
  "Channel-kind quotaConsumption guard against Postgres (Phase 0 item 1)",
  () => {
    test.each(
      CHANNEL_FIXTURES,
    )("$provider: a quota-consuming transition inside a caller-owned tx without quotaConsumption throws instead of silently skipping rollback compensation", ({
      provider,
    }) =>
      withRolledBackTransaction(async (tx) => {
        const workspaceId = await seedWorkspace(tx)
        const created = await insertDisconnectedChannelConnection(
          tx,
          workspaceId,
          provider,
        )

        await expect(
          connectionStateService.transition({
            connectionId: created.id,
            event: "connect.completed",
            ownerId: "guard-test-owner",
            tx,
          }),
        ).rejects.toThrow(
          `connection ${created.id} consumes channel quota inside a caller-owned transaction without rollback tracking`,
        )
      }))
  },
)

describe.skipIf(!databaseUrl)(
  "connectTargets: fresh channel connect against Postgres (Phase 0 item 3)",
  () => {
    test.each(
      CHANNEL_FIXTURES.filter(
        (fixture) =>
          fixture.provider === "messenger" ||
          fixture.provider === "instagram" ||
          fixture.provider === "threads",
      ),
    )("$provider: a fresh connectTargets call commits Connection+Inbox+channels quota and completes the session", async (fixture) => {
      const { ownerId, workspaceId } = await seedCommittedWorkspace(true)
      const adapter = CONNECTION_REGISTRY[fixture.provider]
      if (!adapter) {
        throw new Error(`${fixture.provider} has no adapter registered`)
      }
      // Stubs out the one real network call on this path
      // (`subscribePageToAppWebhook`/`subscribePageToInstagramWebhook`) so
      // the test exercises the real `ConnectSession` -> `connectTargets`
      // -> `upsertConnectionRow` -> quota/Inbox-mirror chain against
      // Postgres/Redis without depending on reaching Meta's Graph API.
      const webhookSubscribeSpy = adapter.provider.webhook
        ? vi
            .spyOn(adapter.provider.webhook, "subscribe")
            .mockResolvedValue(undefined)
        : undefined

      try {
        const sourceId = createId()
        const candidate = {
          sourceId,
          displayName: fixture.displayName,
          auth: fixture.auth(sourceId),
        }
        const { session } = await connectSessionService.create({
          workspaceId,
          provider: fixture.provider,
          purpose: "connect",
          actorUserId: ownerId,
        })
        const encryptedAuth = await encryptUtils.encryptObject(
          [candidate],
          `connect-session:${session.id}`,
        )
        await connectSessionService.attachAuthorization({
          id: session.id,
          workspaceId,
          encryptedAuth,
          targets: [
            { id: sourceId, name: candidate.displayName, selectable: true },
          ],
        })

        const result = await connectTargets({
          sessionId: session.id,
          workspaceId,
          targetIds: [sourceId],
        })

        expect(result.connections).toHaveLength(1)
        const connection = result.connections[0]
        if (!connection) {
          throw new Error("connectTargets returned no connection")
        }
        expect(connection.kind).toBe("channel")
        expect(connection.status).toBe("connected")
        expect(result.outcomes).toEqual([
          {
            targetId: sourceId,
            status: "connected",
            connectionId: connection.id,
          },
        ])
        expect(result.session.status).toBe("completed")

        if (!connection.inboxId) {
          throw new Error("connectTargets connection has no inboxId")
        }
        const [inbox] = await db
          .select()
          .from(inboxModel)
          .where(eq(inboxModel.id, connection.inboxId))
          .limit(1)
        expect(inbox?.status).toBe("connected")
        expect(inbox?.disconnectReason).toBeNull()

        const [quota] = await db
          .select()
          .from(userQuotaModel)
          .where(eq(userQuotaModel.userId, ownerId))
          .limit(1)
        expect(quota?.channelsUsed).toBe(1)
      } finally {
        webhookSubscribeSpy?.mockRestore()
        await cleanupCommittedWorkspace({ ownerId, workspaceId })
      }
    })
  },
)

describe.skipIf(!databaseUrl)(
  "disconnect: deferred channels-quota release across its own db.transaction (M8 commit-deferral follow-up)",
  () => {
    test("a failure after transition() inside disconnect's own transaction rolls back the status write and does not release channels quota", async () => {
      const { ownerId, workspaceId } = await seedCommittedWorkspace(true)
      try {
        const fixture = CHANNEL_FIXTURES.find(
          (candidate) => candidate.provider === "webchat",
        )
        if (!fixture) {
          throw new Error("webchat fixture not found")
        }
        const store = storeFor("webchat")
        const sourceId = createId()

        const connection = await db.transaction(async (tx) => {
          const { inbox } = await inboxService.create({
            data: {
              workspaceId,
              channel: toChannelType("webchat"),
              sourceId,
              name: fixture.displayName,
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
            descriptor: { sourceId, displayName: fixture.displayName },
            auth: fixture.auth(sourceId),
            extraConfig: fixture.extraConfig,
            existing: undefined,
            store,
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

        // Forces `disconnect`'s own `db.transaction` to fail on the very
        // last statement it runs AFTER `connectionStateService.transition`
        // has already decided to release this connection's `channels`
        // quota unit — simulating exactly the race this fix closes: a
        // later statement in the SAME caller-owned transaction rolling
        // back after `transition` returned.
        const deleteRowByForeignKeySpy = vi
          .spyOn(store, "deleteRowByForeignKey")
          .mockRejectedValueOnce(new Error("simulated post-transition failure"))

        try {
          await expect(
            disconnect({ connectionId: connection.id, workspaceId }),
          ).rejects.toThrow("simulated post-transition failure")

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
          // returns (instead of after `disconnect`'s own transaction
          // commits) would under-count here even though nothing actually
          // disconnected.
          expect(quotaAfterRollback?.channelsUsed).toBe(1)
        } finally {
          deleteRowByForeignKeySpy.mockRestore()
        }
      } finally {
        await cleanupCommittedWorkspace({ ownerId, workspaceId })
      }
    })
  },
)
