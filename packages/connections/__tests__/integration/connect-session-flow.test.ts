// @vitest-environment node

/**
 * Real-Postgres coverage for four `connect-session-flow.ts` fixes:
 *
 * - `completeReconnect` satellite reinsert: reconnecting a channel whose
 *   satellite row no longer exists (a prior full disconnect deletes it —
 *   `onDisconnect: "delete_row"`) must pass the provider's
 *   `candidateToConfig(reconnectAuth)` as `extraConfig`, not `{}` — IG's
 *   `pageId`/`username` columns are NOT NULL with no database default.
 * - `listAndAttachCandidates` IG picker: a sibling-provider satellite row
 *   existing is not enough to grey out a candidate — only an ACTUALLY
 *   ACTIVE `Connection` row should. The raw cross-provider query now lives
 *   on `integrationInstagramRepository.findActiveWorkspacesByIgIds`.
 * - `completeReconnect`'s `connectionRepository.update` result: a no-match
 *   update must be treated as an error, not silently ignored.
 * - `completeReconnect`, legacy sourceId: a `legacy:`-prefixed
 *   `Connection.sourceId` (a backfill-script marker for a row it could not
 *   resolve a real sourceId for) must be accepted as a match on reconnect
 *   and overwritten with the descriptor's real sourceId.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run with
 * `pnpm --filter @chatbotx.io/connections test:db`.
 */

import { connectSessionService } from "@chatbotx.io/business/connect-session"
import { db, eq } from "@chatbotx.io/database/client"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import {
  connectionModel,
  inboxModel,
  integrationInstagramModel,
  userModel,
  userQuotaModel,
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { describe, expect, test, vi } from "vitest"

const NOT_FOUND_ERROR_RE = /not found/i

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

const mocks = vi.hoisted(() => ({
  instagramExchangeCode: vi.fn(),
  instagramWebhookSubscribe: vi.fn(async () => undefined),
  instagramWebhookUnsubscribe: vi.fn(async () => undefined),
  instagramFacebookListCandidates: vi.fn(),
}))

// Keeps the REAL store binding (so Postgres sees the actual NOT NULL/CHECK
// constraints) and the REAL `describe`/`candidateToConfig` pure functions,
// but swaps out every network-calling provider method
// (`exchangeCode`/`webhook`/`listCandidates`) for a controllable stub — this
// suite must never make a real call to Meta's APIs.
vi.mock("../../src/registry", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const registry = actual.CONNECTION_REGISTRY as Record<
    string,
    { provider: Record<string, unknown>; store?: unknown } | null
  >
  const realInstagram = registry.instagram
  const realInstagramFacebook = registry.instagramFacebook
  if (!(realInstagram && realInstagramFacebook)) {
    throw new Error("instagram/instagramFacebook adapters must be registered")
  }
  return {
    ...actual,
    CONNECTION_REGISTRY: {
      ...registry,
      instagram: {
        ...realInstagram,
        provider: {
          ...realInstagram.provider,
          exchangeCode: mocks.instagramExchangeCode,
          webhook: {
            subscribe: mocks.instagramWebhookSubscribe,
            unsubscribe: mocks.instagramWebhookUnsubscribe,
          },
        },
      },
      instagramFacebook: {
        ...realInstagramFacebook,
        provider: {
          ...realInstagramFacebook.provider,
          listCandidates: mocks.instagramFacebookListCandidates,
        },
      },
    },
  }
})

// Dynamic (not static) import: the mock factory above is `async`
// (`importOriginal`), so the module under test must be re-imported after
// that promise settles — matching this package's own
// `connect-targets-tamper.test.ts` convention for the same reason.
const { completeAuthorization, listAndAttachCandidates } = await import(
  "../../src/connect-session-flow"
)

const buildInstagramAuth = (metadata: {
  igId: string
  pageId: string
  username: string
}) =>
  ({
    authType: "oauth2",
    clientId: "client-1",
    clientSecret: "secret-1",
    redirectUrl: "https://app.example.test/callback",
    tokens: { accessToken: "token-1" },
    metadata: {
      igId: metadata.igId,
      igName: "Test IG account",
      pageId: metadata.pageId,
      username: metadata.username,
      version: "v19.0",
    },
  }) as never

const seedWorkspaceWithOwner = async (): Promise<{
  workspaceId: string
  ownerId: string
}> => {
  const ownerId = createId()
  const workspaceId = createId()
  await db.insert(userModel).values({
    id: ownerId,
    email: `connect-session-flow-${ownerId}@example.test`,
    name: "Connect session flow test owner",
  })
  await db.insert(workspaceModel).values({
    id: workspaceId,
    ownerId,
    name: "Connect session flow test workspace",
  })
  await db.insert(workspaceMemberModel).values({
    id: createId(),
    workspaceId,
    userId: ownerId,
    role: "owner",
    notificationChannels: {},
    notificationTypes: {},
    permissions: {},
  })
  // `isCloud()` is true in this environment (`NEXT_PUBLIC_EDITION=cloud`),
  // so `quotaEnforcementService.tryConsume`'s channel-quota gate applies for
  // real. `UserQuotaService.getForUser` overlays the published default-plan
  // snapshot over any row whose `planStatus` is still `null` ("free tier /
  // not yet synced") — so `channelsLimit: null` alone is NOT honored as
  // unlimited unless `planStatus` is also set to a synced status, which
  // skips that overlay entirely and returns this row as-is.
  await db.insert(userQuotaModel).values({
    id: createId(),
    userId: ownerId,
    channelsLimit: null,
    planStatus: "active",
  })
  return { workspaceId, ownerId }
}

/** Cascades (`onDelete: "cascade"`) take Inbox/Connection/satellite/ConnectSession rows with it. */
const cleanupWorkspace = async (input: {
  workspaceId: string
  ownerId: string
}): Promise<void> => {
  await db
    .delete(workspaceModel)
    .where(eq(workspaceModel.id, input.workspaceId))
  await db.delete(userModel).where(eq(userModel.id, input.ownerId))
}

const insertInbox = async (input: {
  workspaceId: string
  sourceId: string
}): Promise<string> => {
  const id = createId()
  await db.insert(inboxModel).values({
    id,
    workspaceId: input.workspaceId,
    channel: "instagram",
    sourceId: input.sourceId,
    name: "Test IG inbox",
  })
  return id
}

const insertInstagramConnection = async (input: {
  workspaceId: string
  inboxId: string
  sourceId: string
  provider: string
  status: "disconnected" | "needs_reauth"
}): Promise<string> => {
  const id = createId()
  await db.insert(connectionModel).values({
    id,
    workspaceId: input.workspaceId,
    provider: input.provider,
    kind: "channel",
    channel: "instagram",
    inboxId: input.inboxId,
    sourceId: input.sourceId,
    displayName: "Test IG account",
    status: input.status,
    statusReason: input.status === "disconnected" ? "manual" : "token_revoked",
    disconnectedAt: input.status === "disconnected" ? new Date() : null,
  })
  return id
}

const insertInstagramSatellite = async (input: {
  workspaceId: string
  inboxId: string
  igId: string
  pageId: string
  username: string
}): Promise<string> => {
  const id = createId()
  await db.insert(integrationInstagramModel).values({
    id,
    workspaceId: input.workspaceId,
    inboxId: input.inboxId,
    igId: input.igId,
    pageId: input.pageId,
    username: input.username,
    name: "Test IG account",
    auth: buildInstagramAuth(input),
    conversationStarters: [],
    persistentMenus: [],
    type: "instagram",
  })
  return id
}

describe.skipIf(!databaseUrl)(
  "connect-session-flow fixes against Postgres",
  () => {
    test("completeReconnect reinserts the deleted IG satellite row with pageId/username instead of violating NOT NULL", async () => {
      const { workspaceId, ownerId } = await seedWorkspaceWithOwner()
      const igId = `ig-${createId()}`
      try {
        const inboxId = await insertInbox({ workspaceId, sourceId: igId })
        const connectionId = await insertInstagramConnection({
          workspaceId,
          inboxId,
          sourceId: igId,
          provider: "instagram",
          status: "disconnected",
        })
        mocks.instagramExchangeCode.mockResolvedValueOnce(
          buildInstagramAuth({
            igId,
            pageId: `page-${igId}`,
            username: `user_${igId}`,
          }),
        )

        const { session, nonce } = await connectSessionService.create({
          workspaceId,
          provider: "instagram",
          purpose: "reconnect",
          targetConnectionId: connectionId,
          actorUserId: ownerId,
        })

        const result = await completeAuthorization({
          sessionId: session.id,
          nonce,
          code: "auth-code",
          callbackUrl: "https://app.example.test/callback",
          credential: {},
        })

        expect(result.status).toBe("completed")

        const [satelliteRow] = await db
          .select()
          .from(integrationInstagramModel)
          .where(eq(integrationInstagramModel.inboxId, inboxId))
          .limit(1)
        expect(satelliteRow?.pageId).toBe(`page-${igId}`)
        expect(satelliteRow?.username).toBe(`user_${igId}`)

        const [connectionRow] = await db
          .select()
          .from(connectionModel)
          .where(eq(connectionModel.id, connectionId))
          .limit(1)
        expect(connectionRow?.status).toBe("connected")
      } finally {
        await cleanupWorkspace({ workspaceId, ownerId })
      }
    })

    test("the IG picker keeps a candidate selectable when the sibling-provider satellite's Connection is needs_reauth, not just because the satellite row exists", async () => {
      const { workspaceId, ownerId } = await seedWorkspaceWithOwner()
      const igId = `ig-${createId()}`
      try {
        const inboxId = await insertInbox({ workspaceId, sourceId: igId })
        await insertInstagramConnection({
          workspaceId,
          inboxId,
          sourceId: igId,
          provider: "instagram",
          status: "needs_reauth",
        })
        await insertInstagramSatellite({
          workspaceId,
          inboxId,
          igId,
          pageId: `page-${igId}`,
          username: `user_${igId}`,
        })
        mocks.instagramFacebookListCandidates.mockResolvedValueOnce([
          {
            sourceId: igId,
            displayName: "Linked via Facebook Page",
            auth: buildInstagramAuth({
              igId,
              pageId: `page-${igId}`,
              username: `user_${igId}`,
            }),
          },
        ])

        const { session } = await connectSessionService.create({
          workspaceId,
          provider: "instagramFacebook",
          purpose: "connect",
          actorUserId: ownerId,
        })

        const result = await listAndAttachCandidates(
          session,
          buildInstagramAuth({
            igId,
            pageId: `page-${igId}`,
            username: `user_${igId}`,
          }),
        )

        const target = result.targets.find((t) => t.id === igId)
        expect(target).toBeDefined()
        expect(target?.selectable).toBe(true)
        expect(target?.alreadyConnected).toBeUndefined()
      } finally {
        await cleanupWorkspace({ workspaceId, ownerId })
      }
    })

    test("completeReconnect throws instead of silently continuing when connectionRepository.update matches no row", async () => {
      const { workspaceId, ownerId } = await seedWorkspaceWithOwner()
      const igId = `ig-${createId()}`
      try {
        const inboxId = await insertInbox({ workspaceId, sourceId: igId })
        const connectionId = await insertInstagramConnection({
          workspaceId,
          inboxId,
          sourceId: igId,
          provider: "instagram",
          status: "needs_reauth",
        })
        await insertInstagramSatellite({
          workspaceId,
          inboxId,
          igId,
          pageId: `page-${igId}`,
          username: `user_${igId}`,
        })
        mocks.instagramExchangeCode.mockResolvedValueOnce(
          buildInstagramAuth({
            igId,
            pageId: `page-${igId}`,
            username: `user_${igId}`,
          }),
        )

        const { session, nonce } = await connectSessionService.create({
          workspaceId,
          provider: "instagram",
          purpose: "reconnect",
          targetConnectionId: connectionId,
          actorUserId: ownerId,
        })

        const updateSpy = vi
          .spyOn(connectionRepository, "update")
          .mockResolvedValueOnce(undefined)
        try {
          await expect(
            completeAuthorization({
              sessionId: session.id,
              nonce,
              code: "auth-code",
              callbackUrl: "https://app.example.test/callback",
              credential: {},
            }),
          ).rejects.toThrow(NOT_FOUND_ERROR_RE)
        } finally {
          updateSpy.mockRestore()
        }
      } finally {
        await cleanupWorkspace({ workspaceId, ownerId })
      }
    })

    test("Phase 4 item 1: completeReconnect accepts a legacy:-prefixed sourceId as a match and overwrites it with the real sourceId", async () => {
      const { workspaceId, ownerId } = await seedWorkspaceWithOwner()
      const legacySourceId = `legacy:${createId()}`
      const realIgId = `ig-${createId()}`
      try {
        const inboxId = await insertInbox({
          workspaceId,
          sourceId: legacySourceId,
        })
        const connectionId = await insertInstagramConnection({
          workspaceId,
          inboxId,
          sourceId: legacySourceId,
          provider: "instagram",
          status: "needs_reauth",
        })
        await insertInstagramSatellite({
          workspaceId,
          inboxId,
          igId: realIgId,
          pageId: `page-${realIgId}`,
          username: `user_${realIgId}`,
        })
        mocks.instagramExchangeCode.mockResolvedValueOnce(
          buildInstagramAuth({
            igId: realIgId,
            pageId: `page-${realIgId}`,
            username: `user_${realIgId}`,
          }),
        )

        const { session, nonce } = await connectSessionService.create({
          workspaceId,
          provider: "instagram",
          purpose: "reconnect",
          targetConnectionId: connectionId,
          actorUserId: ownerId,
        })

        const result = await completeAuthorization({
          sessionId: session.id,
          nonce,
          code: "auth-code",
          callbackUrl: "https://app.example.test/callback",
          credential: {},
        })

        expect(result.status).toBe("completed")

        const [connectionRow] = await db
          .select()
          .from(connectionModel)
          .where(eq(connectionModel.id, connectionId))
          .limit(1)
        expect(connectionRow?.sourceId).toBe(realIgId)
        expect(connectionRow?.status).toBe("connected")
      } finally {
        await cleanupWorkspace({ workspaceId, ownerId })
      }
    })
  },
)
