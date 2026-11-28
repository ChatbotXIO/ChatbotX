// @vitest-environment node

/**
 * Real-Postgres coverage for four `connect-session-flow.ts` fixes:
 *
 * - `completeReconnect` satellite reinsert: reconnecting a channel whose
 *   satellite row no longer exists (a prior full disconnect deletes it —
 *   `onDisconnect: "delete_row"`) must pass the provider's
 *   `candidateToConfig(reconnectAuth)` as `extraConfig`, not `{}` — IG's
 *   `pageId`/`username` columns are NOT NULL with no database default.
 * - `listAndAttachCandidates` IG picker: an account is selectable only when
 *   connect can revive the satellite row holding it (same-provider
 *   `Connection` pointing at that row's inbox); a sibling provider's
 *   satellite blocks it (the identity-holder rule; an active sibling without
 *   a satellite is caught by the occupied-Inbox rule).
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

import { isDeepStrictEqual } from "node:util"
import { connectSessionService } from "@chatbotx.io/business/connect-session"
import { CONNECTION_STORE_BINDINGS } from "@chatbotx.io/business/connection"
import { db, eq, inArray, sql } from "@chatbotx.io/database/client"
import type {
  ConnectionStatus,
  ConnectSessionOutcome,
  IntegrationType,
} from "@chatbotx.io/database/partials"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import {
  connectionModel,
  inboxModel,
  integrationInstagramModel,
  integrationMessengerModel,
  integrationWhatsappModel,
  integrationZaloModel,
  userModel,
  userQuotaModel,
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { encryptUtils } from "@chatbotx.io/encryption"
import type { ConnectionCandidate } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import type { ChannelType } from "@chatbotx.io/utils/channel"
import { afterEach, describe, expect, test, vi } from "vitest"

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
  instagramFacebookWebhookSubscribe: vi.fn(async () => undefined),
  instagramFacebookWebhookUnsubscribe: vi.fn(async () => undefined),
  messengerListCandidates: vi.fn(),
  messengerWebhookSubscribe: vi.fn(
    async (_input: { auth: { tokens: { accessToken: string } } }) => undefined,
  ),
  messengerWebhookUnsubscribe: vi.fn(async () => undefined),
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
  const realMessenger = registry.messenger
  if (!(realInstagram && realInstagramFacebook && realMessenger)) {
    throw new Error(
      "instagram/instagramFacebook/messenger adapters must be registered",
    )
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
      messenger: {
        ...realMessenger,
        provider: {
          ...realMessenger.provider,
          listCandidates: mocks.messengerListCandidates,
          webhook: {
            subscribe: mocks.messengerWebhookSubscribe,
            unsubscribe: mocks.messengerWebhookUnsubscribe,
          },
        },
      },
      instagramFacebook: {
        ...realInstagramFacebook,
        provider: {
          ...realInstagramFacebook.provider,
          listCandidates: mocks.instagramFacebookListCandidates,
          webhook: {
            subscribe: mocks.instagramFacebookWebhookSubscribe,
            unsubscribe: mocks.instagramFacebookWebhookUnsubscribe,
          },
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
const { connectTargets } = await import("../../src/connect-targets")

const buildInstagramAuth = (
  metadata: {
    igId: string
    pageId: string
    username: string
  },
  accessToken = "token-1",
) =>
  ({
    authType: "oauth2",
    clientId: "client-1",
    clientSecret: "secret-1",
    redirectUrl: "https://app.example.test/callback",
    tokens: { accessToken },
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
  provider: "instagram" | "instagramFacebook"
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
  type?: "instagram" | "facebook"
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
    type: input.type ?? "instagram",
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

    const igCandidate = (igId: string) => ({
      sourceId: igId,
      displayName: "Linked via Facebook Page",
      auth: buildInstagramAuth({
        igId,
        pageId: `page-${igId}`,
        username: `user_${igId}`,
      }),
    })

    test("the IG picker blocks a candidate whose satellite belongs to the sibling provider's needs_reauth Connection, since connect cannot revive it", async () => {
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
          igCandidate(igId),
        ])

        const { session } = await connectSessionService.create({
          workspaceId,
          provider: "instagramFacebook",
          purpose: "connect",
          actorUserId: ownerId,
        })

        const result = await listAndAttachCandidates(
          session,
          igCandidate(igId).auth,
        )

        const target = result.targets.find((t) => t.id === igId)
        expect(target?.selectable).toBe(false)
        expect(target?.alreadyConnected).toBe("this_workspace")
      } finally {
        await cleanupWorkspace({ workspaceId, ownerId })
      }
    })

    test("a same-provider needs_reauth Connection holding the satellite stays selectable and connectTargets revives it in place", async () => {
      const { workspaceId, ownerId } = await seedWorkspaceWithOwner()
      const igId = `ig-${createId()}`
      try {
        const inboxId = await insertInbox({ workspaceId, sourceId: igId })
        const connectionId = await insertInstagramConnection({
          workspaceId,
          inboxId,
          sourceId: igId,
          provider: "instagramFacebook",
          status: "needs_reauth",
        })
        await insertInstagramSatellite({
          workspaceId,
          inboxId,
          igId,
          pageId: `page-${igId}`,
          username: `user_${igId}`,
          type: "facebook",
        })
        mocks.instagramFacebookListCandidates.mockResolvedValueOnce([
          igCandidate(igId),
        ])

        const { session } = await connectSessionService.create({
          workspaceId,
          provider: "instagramFacebook",
          purpose: "connect",
          actorUserId: ownerId,
        })
        const listed = await listAndAttachCandidates(
          session,
          igCandidate(igId).auth,
        )
        const target = listed.targets.find((t) => t.id === igId)
        expect(target?.selectable).toBe(true)
        expect(target?.alreadyConnected).toBeUndefined()

        const { outcomes } = await connectTargets({
          sessionId: session.id,
          workspaceId,
          targetIds: [igId],
          actorUserId: ownerId,
        })
        expect(outcomes).toEqual([
          expect.objectContaining({ targetId: igId, status: "connected" }),
        ])

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

// ---------------------------------------------------------------------------
// Picker / connect agreement matrix
//
// Product rule: when connect would be rejected, the picker must already show
// the account as connected (this_workspace / other_workspace) wherever the
// blocker lives; an account is selectable only when connect really succeeds.
//
// Everything below runs against the real local Postgres with committed
// fixtures (`connectTargets` opens its own transactions). Only the provider's
// network calls (`listCandidates`, webhook subscribe) are stubbed; the
// repositories, store bindings, encryption, session persistence, quota and
// connection state machine are real. WhatsApp is intentionally absent: its
// production onboarding is `self_serve`, not this OAuth selection flow.
// ---------------------------------------------------------------------------

type WorkspaceRole = "A" | "B"
type MatrixProvider = "messenger" | "instagram" | "instagramFacebook" | "zalo"
type InstagramSatelliteType = "instagram" | "facebook"
/** Which identity a fixture row carries: the listed account `p`, a legacy marker, or another account `q`. */
type SourceKey = "p" | "legacy" | "q"
type Picker = "S" | "A" | "B" | "U"
type Submit =
  | "Fresh"
  | "Revive"
  | "Reinsert"
  | "InboxReuse"
  | "TakeOver"
  | "D"
  | "N"

type FixtureItem =
  | {
      kind: "inbox"
      ws: WorkspaceRole
      ref: string
      src: SourceKey
      status?: "connected" | "disconnected"
    }
  | {
      kind: "satellite"
      ws: WorkspaceRole
      inbox: string
      type?: InstagramSatelliteType
      identity?: SourceKey
    }
  | {
      kind: "connection"
      ws: WorkspaceRole
      inbox: string
      status: ConnectionStatus
      provider?: MatrixProvider
      src: SourceKey
    }

type CandidateOptions = {
  unavailable?: boolean
  marker?: "this_workspace" | "other_workspace"
}

type MatrixCase = {
  name: string
  provider: MatrixProvider
  fixture: FixtureItem[]
  candidate?: CandidateOptions
  picker: Picker
  submit: Submit
}

type Row = { id: string; workspaceId: string } & Record<string, unknown>
type Snapshot = {
  inboxes: Row[]
  satellites: Row[]
  connections: Row[]
}
type RowDiff = {
  added: Row[]
  removed: Row[]
  changed: { before: Row; after: Row }[]
}
type WorkspaceHandle = { workspaceId: string; ownerId: string }
type SeededCase = {
  A: WorkspaceHandle
  B: WorkspaceHandle
  p: string
  inboxIds: Record<string, string>
  satelliteIds: string[]
  connectionIds: string[]
}

const MATRIX_TIMEOUT_MS = 60_000
const ACTIVE_STATUSES = ["connected", "degraded"] as const
const INACTIVE_STATUSES = ["needs_reauth", "paused", "disconnected"] as const
const ALL_STATUSES = [...ACTIVE_STATUSES, ...INACTIVE_STATUSES] as const

const STATUS_REASON: Record<ConnectionStatus, string | null> = {
  connected: null,
  degraded: "verify_failed",
  needs_reauth: "token_revoked",
  paused: "quota_exceeded",
  disconnected: "manual",
}

const CHANNEL_OF: Record<MatrixProvider, ChannelType> = {
  messenger: "messenger",
  instagram: "instagram",
  instagramFacebook: "instagram",
  zalo: "zalo",
}
const SATELLITE_TYPE_OF: Record<
  "instagram" | "instagramFacebook",
  InstagramSatelliteType
> = { instagram: "instagram", instagramFacebook: "facebook" }
const SIBLING_OF: Record<
  "instagram" | "instagramFacebook",
  "instagram" | "instagramFacebook"
> = { instagram: "instagramFacebook", instagramFacebook: "instagram" }

const PICKER_LABEL: Record<Picker, string> = {
  S: "selectable",
  A: "this_workspace",
  B: "other_workspace",
  U: "insufficientPermissions",
}
const SUBMIT_LABEL: Record<Submit, string> = {
  Fresh: "connect fresh",
  Revive: "revive in place",
  Reinsert: "reinsert satellite",
  InboxReuse: "reuse inbox",
  TakeOver: "take over sibling connection",
  D: "duplicated/alreadyConnected",
  N: "failed/notSelectable",
}

const sourceOf = (key: SourceKey, p: string): string =>
  ({ p, legacy: `legacy:${p}`, q: `q-${p}` })[key]

// --- fixture DSL -----------------------------------------------------------

const defaultRef = (ws: WorkspaceRole): string => `I${ws}`

const I = (
  ws: WorkspaceRole,
  options: {
    ref?: string
    src?: SourceKey
    status?: "connected" | "disconnected"
  } = {},
): FixtureItem => ({
  kind: "inbox",
  ws,
  ref: options.ref ?? defaultRef(ws),
  src: options.src ?? "p",
  ...(options.status ? { status: options.status } : {}),
})
const S = (
  ws: WorkspaceRole,
  options: {
    inbox?: string
    type?: InstagramSatelliteType
    identity?: SourceKey
  } = {},
): FixtureItem => ({
  kind: "satellite",
  ws,
  inbox: options.inbox ?? defaultRef(ws),
  ...(options.type ? { type: options.type } : {}),
  ...(options.identity ? { identity: options.identity } : {}),
})
const C = (
  ws: WorkspaceRole,
  status: ConnectionStatus,
  options: { inbox?: string; provider?: MatrixProvider; src?: SourceKey } = {},
): FixtureItem => ({
  kind: "connection",
  ws,
  inbox: options.inbox ?? defaultRef(ws),
  status,
  src: options.src ?? "p",
  ...(options.provider ? { provider: options.provider } : {}),
})

const mk = (input: {
  id: string
  title: string
  provider: MatrixProvider
  fixture: FixtureItem[]
  picker: Picker
  submit: Submit
  candidate?: CandidateOptions
}): MatrixCase => ({
  name: `${input.id} ${input.provider}: ${input.title} → ${PICKER_LABEL[input.picker]}, ${SUBMIT_LABEL[input.submit]}`,
  provider: input.provider,
  fixture: input.fixture,
  picker: input.picker,
  submit: input.submit,
  ...(input.candidate ? { candidate: input.candidate } : {}),
})

const isActive = (status: ConnectionStatus): boolean =>
  (ACTIVE_STATUSES as readonly ConnectionStatus[]).includes(status)

// --- real-row seeding helpers ----------------------------------------------

const insertChannelInbox = async (input: {
  workspaceId: string
  sourceId: string
  channel: ChannelType
  status: "connected" | "disconnected"
}): Promise<string> => {
  const id = createId()
  await db.insert(inboxModel).values({
    id,
    workspaceId: input.workspaceId,
    channel: input.channel,
    sourceId: input.sourceId,
    name: "Matrix inbox",
    status: input.status,
    ...(input.status === "disconnected"
      ? { disconnectedAt: new Date(), disconnectReason: "manual" as const }
      : {}),
  })
  return id
}

const insertConnection = async (input: {
  workspaceId: string
  inboxId: string
  provider: MatrixProvider
  sourceId: string
  status: ConnectionStatus
}): Promise<string> => {
  const id = createId()
  await db.insert(connectionModel).values({
    id,
    workspaceId: input.workspaceId,
    provider: input.provider as IntegrationType,
    kind: "channel",
    channel: CHANNEL_OF[input.provider],
    inboxId: input.inboxId,
    sourceId: input.sourceId,
    displayName: "Matrix account",
    status: input.status,
    statusReason: STATUS_REASON[input.status] as never,
    disconnectedAt: input.status === "disconnected" ? new Date() : null,
  })
  return id
}

const SEEDED_TOKEN = "seeded-token"
const seededAuth = (provider: MatrixProvider, sourceId: string) =>
  buildAuth(provider, sourceId, SEEDED_TOKEN, "seeded")

const insertMessengerSatellite = async (input: {
  workspaceId: string
  inboxId: string
  pageId: string
}): Promise<string> => {
  const id = createId()
  await db.insert(integrationMessengerModel).values({
    id,
    workspaceId: input.workspaceId,
    inboxId: input.inboxId,
    pageId: input.pageId,
    name: "Matrix page",
    auth: seededAuth("messenger", input.pageId),
    conversationStarters: [],
    persistentMenus: [],
    personas: [],
  })
  return id
}

const insertZaloSatellite = async (input: {
  workspaceId: string
  inboxId: string
  oaId: string
}): Promise<string> => {
  const id = createId()
  await db.insert(integrationZaloModel).values({
    id,
    workspaceId: input.workspaceId,
    inboxId: input.inboxId,
    oaId: input.oaId,
    name: "Matrix OA",
    auth: seededAuth("zalo", input.oaId) as never,
  })
  return id
}

const insertSatellite = async (input: {
  provider: MatrixProvider
  workspaceId: string
  inboxId: string
  sourceId: string
  type?: InstagramSatelliteType
}): Promise<string> => {
  if (input.provider === "messenger") {
    return await insertMessengerSatellite({
      workspaceId: input.workspaceId,
      inboxId: input.inboxId,
      pageId: input.sourceId,
    })
  }
  if (input.provider === "zalo") {
    return await insertZaloSatellite({
      workspaceId: input.workspaceId,
      inboxId: input.inboxId,
      oaId: input.sourceId,
    })
  }
  return await insertInstagramSatellite({
    workspaceId: input.workspaceId,
    inboxId: input.inboxId,
    igId: input.sourceId,
    pageId: `page-seeded-${input.sourceId}`,
    username: `user_seeded_${input.sourceId}`,
    type: input.type ?? SATELLITE_TYPE_OF[input.provider],
  })
}

// --- auth / candidate builders ----------------------------------------------

function buildAuth(
  provider: MatrixProvider,
  sourceId: string,
  accessToken: string,
  flavour: "seeded" | "fresh",
) {
  const base = {
    authType: "oauth2",
    clientId: "client-1",
    clientSecret: "secret-1",
    redirectUrl: "https://app.example.test/callback",
    tokens: { accessToken },
  }
  const suffix = flavour === "seeded" ? "old" : "new"
  if (provider === "messenger") {
    return {
      ...base,
      metadata: {
        pageId: sourceId,
        pageName: `Page ${sourceId}`,
        version: "v19.0",
      },
    } as never
  }
  if (provider === "zalo") {
    return {
      ...base,
      oaId: sourceId,
      metadata: { version: "v4", oaName: `OA ${sourceId}` },
    } as never
  }
  return buildInstagramAuth(
    {
      igId: sourceId,
      pageId: `page-${suffix}-${sourceId}`,
      username: `user_${suffix}_${sourceId}`,
    },
    accessToken,
  )
}

const tokenOf = (sourceId: string): string => `token-for-${sourceId}`

const buildCandidate = (
  provider: MatrixProvider,
  sourceId: string,
  options: CandidateOptions = {},
): ConnectionCandidate => ({
  sourceId,
  displayName: `Account ${sourceId}`,
  auth: buildAuth(provider, sourceId, tokenOf(sourceId), "fresh"),
  ...(options.unavailable
    ? { unavailableReason: "insufficientPermissions" as const }
    : {}),
  ...(options.marker ? { alreadyConnected: options.marker } : {}),
})

// --- seeding / snapshots -----------------------------------------------------

const seedWorkspaces = async (): Promise<{
  A: WorkspaceHandle
  B: WorkspaceHandle
}> => ({
  A: await seedWorkspaceWithOwner(),
  B: await seedWorkspaceWithOwner(),
})

const cleanupSeeded = async (seeded: {
  A: WorkspaceHandle
  B: WorkspaceHandle
}): Promise<void> => {
  await cleanupWorkspace(seeded.A)
  await cleanupWorkspace(seeded.B)
}

const seedFixture = async (input: {
  workspaces: { A: WorkspaceHandle; B: WorkspaceHandle }
  provider: MatrixProvider
  fixture: FixtureItem[]
  p: string
}): Promise<SeededCase> => {
  const { workspaces, provider, fixture, p } = input
  const channel = CHANNEL_OF[provider]
  const inboxIds: Record<string, string> = {}
  const satelliteIds: string[] = []
  const connectionIds: string[] = []
  const inboxItems = fixture.filter((item) => item.kind === "inbox")
  const connectionItems = fixture.filter((item) => item.kind === "connection")
  for (const item of inboxItems) {
    const linked = connectionItems.find((c) => c.inbox === item.ref)
    const derived =
      linked && !isActive(linked.status) ? "disconnected" : "connected"
    inboxIds[item.ref] = await insertChannelInbox({
      workspaceId: workspaces[item.ws].workspaceId,
      sourceId: sourceOf(item.src, p),
      channel,
      status: item.status ?? derived,
    })
  }
  for (const item of fixture) {
    if (item.kind !== "satellite") {
      continue
    }
    satelliteIds.push(
      await insertSatellite({
        provider,
        workspaceId: workspaces[item.ws].workspaceId,
        inboxId: inboxIds[item.inbox] as string,
        sourceId: sourceOf(item.identity ?? "p", p),
        ...(item.type ? { type: item.type } : {}),
      }),
    )
  }
  for (const item of connectionItems) {
    connectionIds.push(
      await insertConnection({
        workspaceId: workspaces[item.ws].workspaceId,
        inboxId: inboxIds[item.inbox] as string,
        provider: item.provider ?? provider,
        sourceId: sourceOf(item.src, p),
        status: item.status,
      }),
    )
  }
  return { ...workspaces, p, inboxIds, satelliteIds, connectionIds }
}

const byId = (rows: Row[]): Row[] =>
  [...rows].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))

/** Every Inbox/satellite/Connection row of both test workspaces. */
const snapshotOf = async (workspaces: {
  A: WorkspaceHandle
  B: WorkspaceHandle
}): Promise<Snapshot> => {
  const ids = [workspaces.A.workspaceId, workspaces.B.workspaceId]
  const inboxes = await db
    .select()
    .from(inboxModel)
    .where(inArray(inboxModel.workspaceId, ids))
  const connections = await db
    .select()
    .from(connectionModel)
    .where(inArray(connectionModel.workspaceId, ids))
  const messenger = await db
    .select()
    .from(integrationMessengerModel)
    .where(inArray(integrationMessengerModel.workspaceId, ids))
  const instagram = await db
    .select()
    .from(integrationInstagramModel)
    .where(inArray(integrationInstagramModel.workspaceId, ids))
  const zalo = await db
    .select()
    .from(integrationZaloModel)
    .where(inArray(integrationZaloModel.workspaceId, ids))
  return {
    inboxes: byId(inboxes),
    connections: byId(connections),
    satellites: byId([
      ...messenger.map((row) => ({ ...row, table: "messenger" })),
      ...instagram.map((row) => ({ ...row, table: "instagram" })),
      ...zalo.map((row) => ({ ...row, table: "zalo" })),
    ]),
  }
}

const diffRows = (before: Row[], after: Row[]): RowDiff => {
  const beforeById = new Map(before.map((row) => [row.id, row]))
  const afterById = new Map(after.map((row) => [row.id, row]))
  return {
    added: after.filter((row) => !beforeById.has(row.id)),
    removed: before.filter((row) => !afterById.has(row.id)),
    changed: after.flatMap((row) => {
      const previous = beforeById.get(row.id)
      return previous && !isDeepStrictEqual(previous, row)
        ? [{ before: previous, after: row }]
        : []
    }),
  }
}

const diffSnapshots = (before: Snapshot, after: Snapshot) => ({
  inboxes: diffRows(before.inboxes, after.inboxes),
  satellites: diffRows(before.satellites, after.satellites),
  connections: diffRows(before.connections, after.connections),
})

const expectNoRemovals = (diff: ReturnType<typeof diffSnapshots>): void => {
  expect(diff.inboxes.removed).toEqual([])
  expect(diff.satellites.removed).toEqual([])
  expect(diff.connections.removed).toEqual([])
}

const IDENTITY_COLUMN: Record<string, string> = {
  messenger: "pageId",
  instagram: "igId",
  zalo: "oaId",
}
const tokenInAuth = (row: Row): unknown =>
  (row.auth as { tokens?: { accessToken?: string } }).tokens?.accessToken

// --- picker / session helpers -------------------------------------------------

const webhookCallCount = (): number =>
  mocks.messengerWebhookSubscribe.mock.calls.length +
  mocks.instagramWebhookSubscribe.mock.calls.length +
  mocks.instagramFacebookWebhookSubscribe.mock.calls.length

const startSession = async (
  workspace: WorkspaceHandle,
  provider: MatrixProvider,
) =>
  (
    await connectSessionService.create({
      workspaceId: workspace.workspaceId,
      provider,
      purpose: "connect",
      actorUserId: workspace.ownerId,
    })
  ).session

/** Lists `candidates` through the real picker code, with only the provider's network call stubbed. */
const listFor = async (
  session: Awaited<ReturnType<typeof startSession>>,
  provider: MatrixProvider,
  candidates: ConnectionCandidate[],
) => {
  if (provider === "messenger") {
    mocks.messengerListCandidates.mockResolvedValueOnce(candidates)
  } else if (provider === "instagramFacebook") {
    mocks.instagramFacebookListCandidates.mockResolvedValueOnce(candidates)
  } else if (candidates.length > 1) {
    throw new Error(`${provider} lists exactly one candidate (describe)`)
  }
  const [first] = candidates
  return await listAndAttachCandidates(
    session,
    first?.auth ?? buildAuth(provider, "unused", "unused", "fresh"),
  )
}

type ListedSession = Awaited<ReturnType<typeof listFor>>
type ListedTarget = ListedSession["targets"][number]

const expectTarget = (target: ListedTarget | undefined, picker: Picker) => {
  expect(target).toBeDefined()
  const expected: Record<Picker, Partial<ListedTarget>> = {
    S: { selectable: true },
    A: { selectable: false, alreadyConnected: "this_workspace" },
    B: { selectable: false, alreadyConnected: "other_workspace" },
    U: { selectable: false, disabledReason: "insufficientPermissions" },
  }
  expect(target?.selectable).toBe(expected[picker].selectable)
  expect(target?.alreadyConnected).toBe(expected[picker].alreadyConnected)
  expect(target?.disabledReason).toBe(expected[picker].disabledReason)
}

const decryptStoredCandidates = async (listed: ListedSession) => {
  if (!listed.encryptedAuth) {
    return []
  }
  const { encryptedCandidatesSchema } = await import("../../src/internal")
  return await encryptUtils.decryptObject(
    listed.encryptedAuth,
    encryptedCandidatesSchema,
    `connect-session:${listed.id}`,
  )
}

const OUTCOME_OF_BLOCK: Record<"D" | "N", ConnectSessionOutcome> = {
  D: { targetId: "", status: "duplicated", reason: "alreadyConnected" },
  N: { targetId: "", status: "failed", reason: "notSelectable" },
}

afterEach(() => {
  mocks.messengerWebhookSubscribe.mockClear()
  mocks.instagramWebhookSubscribe.mockClear()
  mocks.instagramFacebookWebhookSubscribe.mockClear()
  mocks.messengerListCandidates.mockReset()
  mocks.instagramFacebookListCandidates.mockReset()
})

// --- per-kind row effect assertions ------------------------------------------

type EffectInput = {
  seeded: SeededCase
  provider: MatrixProvider
  before: Snapshot
  after: Snapshot
  connectionId: string | undefined
}

const expectFreshEffect = (input: EffectInput): void => {
  const { seeded, provider, before, after } = input
  const diff = diffSnapshots(before, after)
  expectNoRemovals(diff)
  expect(diff.inboxes.changed).toEqual([])
  expect(diff.satellites.changed).toEqual([])
  expect(diff.connections.changed).toEqual([])
  expect(diff.inboxes.added).toHaveLength(1)
  expect(diff.satellites.added).toHaveLength(1)
  expect(diff.connections.added).toHaveLength(1)
  const [inbox] = diff.inboxes.added
  const [satellite] = diff.satellites.added
  const [connection] = diff.connections.added
  expect(inbox).toMatchObject({
    workspaceId: seeded.A.workspaceId,
    sourceId: seeded.p,
    channel: CHANNEL_OF[provider],
    status: "connected",
  })
  expect(satellite).toMatchObject({
    workspaceId: seeded.A.workspaceId,
    inboxId: inbox?.id,
  })
  expect(
    satellite?.[IDENTITY_COLUMN[satellite?.table as string] as string],
  ).toBe(seeded.p)
  expect(tokenInAuth(satellite as Row)).toBe(tokenOf(seeded.p))
  expect(connection).toMatchObject({
    id: input.connectionId,
    workspaceId: seeded.A.workspaceId,
    provider,
    kind: "channel",
    sourceId: seeded.p,
    status: "connected",
    statusReason: null,
    inboxId: inbox?.id,
    // A channel Connection links its satellite through the Inbox, never `integrationId`.
    integrationId: null,
  })
}

/** Revive: same rows (Connection, satellite, Inbox) updated in place; nothing added or removed. */
const expectReviveEffect = (input: EffectInput): void => {
  const { seeded, provider, before, after } = input
  const diff = diffSnapshots(before, after)
  expectNoRemovals(diff)
  expect(diff.inboxes.added).toEqual([])
  expect(diff.satellites.added).toEqual([])
  expect(diff.connections.added).toEqual([])
  const connectionId = seeded.connectionIds[0]
  const satelliteId = seeded.satelliteIds[0]
  expect(input.connectionId).toBe(connectionId)
  expect(diff.connections.changed.map((c) => c.after.id)).toEqual([
    connectionId,
  ])
  expect(diff.satellites.changed.map((c) => c.after.id)).toEqual([satelliteId])
  const [connection] = diff.connections.changed
  expect(connection?.after).toMatchObject({
    status: "connected",
    statusReason: null,
    lastError: null,
    inboxId: connection?.before.inboxId,
  })
  const [satellite] = diff.satellites.changed
  expect(tokenInAuth(satellite?.after as Row)).toBe(tokenOf(seeded.p))
  expect(satellite?.after.inboxId).toBe(satellite?.before.inboxId)
  if (provider === "instagram" || provider === "instagramFacebook") {
    expect(satellite?.after.type).toBe(satellite?.before.type)
    expect(satellite?.after.pageId).toBe(`page-new-${seeded.p}`)
    expect(satellite?.after.username).toBe(`user_new_${seeded.p}`)
  }
  const inboxChange = diff.inboxes.changed.find(
    (c) => c.after.id === connection?.after.inboxId,
  )
  const inbox = after.inboxes.find(
    (row) => row.id === connection?.after.inboxId,
  )
  expect(inbox?.status).toBe("connected")
  expect(diff.inboxes.changed.length).toBe(inboxChange ? 1 : 0)
}

/** A satellite-less Connection+Inbox pair: the Connection/Inbox ids survive and a new satellite is inserted. */
const expectSatelliteRebuiltEffect = (
  input: EffectInput,
  expected: { provider: MatrixProvider; newConnection: boolean },
): void => {
  const { seeded, before, after } = input
  const diff = diffSnapshots(before, after)
  expectNoRemovals(diff)
  expect(diff.inboxes.added).toEqual([])
  expect(diff.satellites.changed).toEqual([])
  expect(diff.satellites.added).toHaveLength(1)
  expect(diff.connections.added).toHaveLength(expected.newConnection ? 1 : 0)
  const [satellite] = diff.satellites.added
  expect(satellite?.workspaceId).toBe(seeded.A.workspaceId)
  expect(
    satellite?.[IDENTITY_COLUMN[satellite?.table as string] as string],
  ).toBe(seeded.p)
  expect(tokenInAuth(satellite as Row)).toBe(tokenOf(seeded.p))
  const connectionRow = after.connections.find(
    (row) => row.id === input.connectionId,
  )
  expect(connectionRow).toMatchObject({
    provider: expected.provider,
    status: "connected",
    statusReason: null,
    inboxId: satellite?.inboxId,
    integrationId: null,
  })
  const inbox = after.inboxes.find((row) => row.id === satellite?.inboxId)
  expect(inbox?.status).toBe("connected")
  expect(inbox?.workspaceId).toBe(seeded.A.workspaceId)
}

const expectEffect = (submit: Submit, input: EffectInput): void => {
  const { seeded, provider, before, after } = input
  if (submit === "D" || submit === "N") {
    expect(after).toEqual(before)
    return
  }
  if (submit === "Fresh") {
    expectFreshEffect(input)
    return
  }
  if (submit === "Revive") {
    expectReviveEffect(input)
    return
  }
  if (submit === "Reinsert") {
    expect(input.connectionId).toBe(seeded.connectionIds[0])
    expectSatelliteRebuiltEffect(input, { provider, newConnection: false })
    return
  }
  if (submit === "TakeOver") {
    expect(input.connectionId).toBe(seeded.connectionIds[0])
    expectSatelliteRebuiltEffect(input, { provider, newConnection: false })
    const satellite = diffSnapshots(before, after).satellites.added[0]
    expect(satellite?.type).toBe(
      SATELLITE_TYPE_OF[provider as "instagram" | "instagramFacebook"],
    )
    return
  }
  // InboxReuse: the lone Inbox row survives, a satellite and a Connection are created.
  const diff = diffSnapshots(before, after)
  expectNoRemovals(diff)
  expect(diff.inboxes.added).toEqual([])
  expect(diff.satellites.added).toHaveLength(1)
  expect(diff.connections.added).toHaveLength(1)
  const inboxId = Object.values(seeded.inboxIds)[0]
  expect(diff.satellites.added[0]?.inboxId).toBe(inboxId)
  expect(diff.connections.added[0]).toMatchObject({
    id: input.connectionId,
    inboxId,
    status: "connected",
  })
  expect(after.inboxes.find((row) => row.id === inboxId)?.status).toBe(
    "connected",
  )
}

const expectOutcome = (input: {
  submit: Submit
  outcomes: ConnectSessionOutcome[]
  p: string
}): string | undefined => {
  const { submit, outcomes, p } = input
  expect(outcomes).toHaveLength(1)
  if (submit === "D" || submit === "N") {
    expect(outcomes[0]).toEqual({ ...OUTCOME_OF_BLOCK[submit], targetId: p })
    return
  }
  expect(outcomes[0]).toMatchObject({ targetId: p, status: "connected" })
  return (outcomes[0] as { connectionId: string }).connectionId
}

const runMatrixCase = async (matrixCase: MatrixCase): Promise<void> => {
  const workspaces = await seedWorkspaces()
  const p = `p-${createId()}`
  try {
    const seeded = await seedFixture({
      workspaces,
      provider: matrixCase.provider,
      fixture: matrixCase.fixture,
      p,
    })
    const before = await snapshotOf(workspaces)
    const candidate = buildCandidate(
      matrixCase.provider,
      p,
      matrixCase.candidate,
    )
    const session = await startSession(workspaces.A, matrixCase.provider)

    const listed = await listFor(session, matrixCase.provider, [candidate])
    const target = listed.targets.find((t) => t.id === p)
    expectTarget(target, matrixCase.picker)
    const stored = await decryptStoredCandidates(listed)
    expect(stored.map((c) => c.sourceId)).toEqual(
      matrixCase.picker === "S" ? [p] : [],
    )
    // Listing is read-only: it never touches Inbox/satellite/Connection rows.
    expect(await snapshotOf(workspaces)).toEqual(before)

    const { outcomes } = await connectTargets({
      sessionId: session.id,
      workspaceId: workspaces.A.workspaceId,
      targetIds: [p],
      actorUserId: workspaces.A.ownerId,
    })
    const connectionId = expectOutcome({
      submit: matrixCase.submit,
      outcomes,
      p,
    })
    const after = await snapshotOf(workspaces)
    expectEffect(matrixCase.submit, {
      seeded,
      provider: matrixCase.provider,
      before,
      after,
      connectionId,
    })
    const blocked = matrixCase.submit === "D" || matrixCase.submit === "N"
    // Zalo registers webhooks per app in its console: no per-connection subscribe.
    expect(webhookCallCount()).toBe(
      blocked || matrixCase.provider === "zalo" ? 0 : 1,
    )
  } finally {
    await cleanupSeeded(workspaces)
  }
}

// --- case tables ---------------------------------------------------------------

const MSG = "messenger" as const
const IG = "instagram" as const
const IGF = "instagramFacebook" as const
const ZALO = "zalo" as const

const WS_PICKER: Record<WorkspaceRole, Picker> = { A: "A", B: "B" }

const HOLDER_ID_B: Record<ConnectionStatus, string> = {
  connected: "#4",
  degraded: "#5",
  needs_reauth: "#6",
  paused: "#7",
  disconnected: "#8",
}
const HOLDER_ID_A: Record<ConnectionStatus, string> = {
  connected: "#9",
  degraded: "#10",
  needs_reauth: "#11",
  paused: "#12",
  disconnected: "#13",
}

const messengerCases: MatrixCase[] = [
  mk({
    id: "#1",
    title: "fresh page",
    provider: MSG,
    fixture: [],
    picker: "S",
    submit: "Fresh",
  }),
  mk({
    id: "#2",
    title: "other workspace orphan satellite, no Connection",
    provider: MSG,
    fixture: [I("B"), S("B")],
    picker: "B",
    submit: "D",
  }),
  mk({
    id: "#3",
    title: "this workspace orphan satellite, no Connection",
    provider: MSG,
    fixture: [I("A"), S("A")],
    picker: "A",
    submit: "D",
  }),
  ...ALL_STATUSES.map((status) =>
    mk({
      id: HOLDER_ID_B[status],
      title: `other workspace holder, ${status}`,
      provider: MSG,
      fixture: [I("B"), S("B"), C("B", status)],
      picker: "B",
      submit: "D",
    }),
  ),
  ...ALL_STATUSES.map((status) =>
    mk({
      id: HOLDER_ID_A[status],
      title: `this workspace holder, ${status}`,
      provider: MSG,
      fixture: [I("A"), S("A"), C("A", status)],
      picker: isActive(status) ? "A" : "S",
      submit: isActive(status) ? "D" : "Revive",
    }),
  ),
  ...ALL_STATUSES.map((status) =>
    mk({
      id: "#14",
      title: `satellite on inbox I, ${status} Connection on a different inbox J`,
      provider: MSG,
      fixture: [
        I("A"),
        I("A", { ref: "J", src: "q" }),
        S("A"),
        C("A", status, { inbox: "J" }),
      ],
      picker: "A",
      submit: "D",
    }),
  ),
  ...(["legacy", "q"] as const).flatMap((src) =>
    ALL_STATUSES.map((status) =>
      mk({
        id: "#15",
        title: `satellite on inbox I, ${status} Connection on the same inbox with sourceId=${src}`,
        provider: MSG,
        fixture: [I("A"), S("A"), C("A", status, { src })],
        picker: "A",
        submit: "D",
      }),
    ),
  ),
  mk({
    id: "#16",
    title: "B disconnected Connection, satellite deleted",
    provider: MSG,
    fixture: [I("B"), C("B", "disconnected")],
    picker: "S",
    submit: "Fresh",
  }),
  mk({
    id: "#17",
    title: "A disconnected Connection, satellite deleted",
    provider: MSG,
    fixture: [I("A"), C("A", "disconnected")],
    picker: "S",
    submit: "Reinsert",
  }),
  ...(["needs_reauth", "paused"] as const).map((status) =>
    mk({
      id: "#18",
      title: `A ${status} Connection, satellite missing`,
      provider: MSG,
      fixture: [I("A"), C("A", status)],
      picker: "S",
      submit: "Reinsert",
    }),
  ),
  ...(["A", "B"] as const).flatMap((ws) =>
    ACTIVE_STATUSES.map((status) =>
      mk({
        id: "#19",
        title: `${ws} ${status} Connection without satellite`,
        provider: MSG,
        fixture: [I(ws), C(ws, status)],
        picker: WS_PICKER[ws],
        submit: "D",
      }),
    ),
  ),
  ...(["needs_reauth", "paused"] as const).map((status) =>
    mk({
      id: "#20",
      title: `B ${status} Connection without satellite`,
      provider: MSG,
      fixture: [I("B"), C("B", status)],
      picker: "S",
      submit: "Fresh",
    }),
  ),
  ...(["connected", "disconnected"] as const).map((status) =>
    mk({
      id: "#21",
      title: `only an A Inbox (${status})`,
      provider: MSG,
      fixture: [I("A", { status })],
      picker: "S",
      submit: "InboxReuse",
    }),
  ),
  ...INACTIVE_STATUSES.flatMap((aStatus) =>
    (["none", ...ALL_STATUSES] as const).map((bStatus) =>
      mk({
        id: "#22",
        title: `A ${aStatus} Connection without satellite, B holder (${bStatus === "none" ? "no Connection" : `${bStatus} Connection`})`,
        provider: MSG,
        fixture: [
          I("A"),
          C("A", aStatus),
          I("B"),
          S("B"),
          ...(bStatus === "none" ? [] : [C("B", bStatus)]),
        ],
        picker: "B",
        submit: "D",
      }),
    ),
  ),
  ...INACTIVE_STATUSES.flatMap((aStatus) =>
    ACTIVE_STATUSES.map((bStatus) =>
      mk({
        id: "#23",
        title: `A ${aStatus} Connection, B ${bStatus} Connection, no satellites`,
        provider: MSG,
        fixture: [I("A"), C("A", aStatus), I("B"), C("B", bStatus)],
        picker: "B",
        submit: "D",
      }),
    ),
  ),
  mk({
    id: "#24",
    title: "fresh page without permissions",
    provider: MSG,
    fixture: [],
    candidate: { unavailable: true },
    picker: "U",
    submit: "N",
  }),
  mk({
    id: "#25",
    title: "B orphan holder + no permissions",
    provider: MSG,
    fixture: [I("B"), S("B")],
    candidate: { unavailable: true },
    picker: "B",
    submit: "D",
  }),
  ...ALL_STATUSES.map((status) =>
    mk({
      id: "#25",
      title: `B ${status} holder + no permissions`,
      provider: MSG,
      fixture: [I("B"), S("B"), C("B", status)],
      candidate: { unavailable: true },
      picker: "B",
      submit: "D",
    }),
  ),
  mk({
    id: "#26",
    title: "A orphan holder + no permissions",
    provider: MSG,
    fixture: [I("A"), S("A")],
    candidate: { unavailable: true },
    picker: "A",
    submit: "D",
  }),
  ...INACTIVE_STATUSES.map((status) =>
    mk({
      id: "#26",
      title: `A holder with ${status} Connection on a different inbox + no permissions`,
      provider: MSG,
      fixture: [
        I("A"),
        I("A", { ref: "J", src: "q" }),
        S("A"),
        C("A", status, { inbox: "J" }),
      ],
      candidate: { unavailable: true },
      picker: "A",
      submit: "D",
    }),
  ),
  ...INACTIVE_STATUSES.map((status) =>
    mk({
      id: "#27",
      title: `A revivable ${status} holder + no permissions`,
      provider: MSG,
      fixture: [I("A"), S("A"), C("A", status)],
      candidate: { unavailable: true },
      picker: "U",
      submit: "N",
    }),
  ),
  ...(["this_workspace", "other_workspace"] as const).flatMap((marker) =>
    [false, true].map((unavailable) =>
      mk({
        id: "#28",
        title: `provider marks it ${marker}${unavailable ? " and unavailable" : ""}`,
        provider: MSG,
        fixture: [],
        candidate: { marker, unavailable },
        picker: marker === "this_workspace" ? "A" : "B",
        submit: "D",
      }),
    ),
  ),
]

const IG_PROVIDERS = [IG, IGF] as const
const SIBLING_STATUSES = [...ALL_STATUSES, "orphan"] as const

/** Matrix row id for a sibling-provider holder (#31-#39). */
const siblingId = (
  session: "instagram" | "instagramFacebook",
  ws: WorkspaceRole,
  status: ConnectionStatus | "orphan",
): string => {
  if (status === "paused" || status === "disconnected" || status === "orphan") {
    return "#39"
  }
  const base = session === IG ? 31 : 35
  const offset = ws === "A" ? 0 : 2
  return `#${base + offset + (isActive(status) ? 0 : 1)}`
}

const instagramCases: MatrixCase[] = [
  // #31-#39: a sibling login's satellite holds the account in A or B.
  ...IG_PROVIDERS.flatMap((session) =>
    (["A", "B"] as const).flatMap((ws) =>
      SIBLING_STATUSES.map((status) =>
        mk({
          id: siblingId(session, ws, status),
          title: `sibling ${SIBLING_OF[session]} satellite in ${ws}, ${status === "orphan" ? "no Connection" : `${status} Connection`}`,
          provider: session,
          fixture: [
            I(ws),
            S(ws, { type: SATELLITE_TYPE_OF[SIBLING_OF[session]] }),
            ...(status === "orphan"
              ? []
              : [C(ws, status, { provider: SIBLING_OF[session] })]),
          ],
          picker: WS_PICKER[ws],
          submit: "D",
        }),
      ),
    ),
  ),
  // #40: same-provider satellite in A or B.
  ...IG_PROVIDERS.flatMap((session) =>
    (["A", "B"] as const).flatMap((ws) =>
      SIBLING_STATUSES.map((status) => {
        const revivable = ws === "A" && status !== "orphan" && !isActive(status)
        return mk({
          id: "#40",
          title: `same-provider satellite in ${ws}, ${status === "orphan" ? "no Connection" : `${status} Connection`}`,
          provider: session,
          fixture: [
            I(ws),
            S(ws),
            ...(status === "orphan" ? [] : [C(ws, status)]),
          ],
          picker: revivable ? "S" : WS_PICKER[ws],
          submit: revivable ? "Revive" : "D",
        })
      }),
    ),
  ),
  // #41: sibling Connection disconnected, satellite deleted, shared Inbox remains.
  ...IG_PROVIDERS.map((session) =>
    mk({
      id: "#41",
      title: `A disconnected ${SIBLING_OF[session]} Connection, satellite deleted`,
      provider: session,
      fixture: [
        I("A"),
        C("A", "disconnected", { provider: SIBLING_OF[session] }),
      ],
      picker: "S",
      submit: "TakeOver",
    }),
  ),
  // #42: B sibling Connection without a satellite is invisible to A.
  ...IG_PROVIDERS.flatMap((session) =>
    ALL_STATUSES.map((status) =>
      mk({
        id: "#42",
        title: `B ${status} ${SIBLING_OF[session]} Connection without satellite`,
        provider: session,
        fixture: [I("B"), C("B", status, { provider: SIBLING_OF[session] })],
        picker: "S",
        submit: "Fresh",
      }),
    ),
  ),
  // #43: session-provider Connection linked to I, but the satellite there is the other slice.
  ...IG_PROVIDERS.flatMap((session) =>
    INACTIVE_STATUSES.map((status) =>
      mk({
        id: "#43",
        title: `A ${status} ${session} Connection, satellite of the opposite type`,
        provider: session,
        fixture: [
          I("A"),
          S("A", { type: SATELLITE_TYPE_OF[SIBLING_OF[session]] }),
          C("A", status),
        ],
        picker: "A",
        submit: "D",
      }),
    ),
  ),
]

/**
 * The reused Inbox is occupied in a way the write path cannot take over:
 * - #44b: a disconnected sibling Connection sits on I, but this workspace's
 *   own same-provider Connection for the account lives on another inbox J
 *   (connect would revive that one and collide on `Connection.inboxId`).
 * - #44c: this workspace's own inactive Connection sits on I next to a
 *   satellite that is not the account's own row (another identity or slice).
 */
const occupiedInboxCases: MatrixCase[] = [
  ...IG_PROVIDERS.flatMap((session) =>
    INACTIVE_STATUSES.map((status) =>
      mk({
        id: "#44b",
        title: `own ${status} Connection on inbox J, disconnected ${SIBLING_OF[session]} Connection on inbox I, no satellites`,
        provider: session,
        fixture: [
          I("A"),
          I("A", { ref: "J", src: "q" }),
          C("A", status, { inbox: "J" }),
          C("A", "disconnected", { provider: SIBLING_OF[session] }),
        ],
        picker: "A",
        submit: "D",
      }),
    ),
  ),
  ...([MSG, IG, IGF, ZALO] as const).flatMap((provider) =>
    INACTIVE_STATUSES.map((status) =>
      mk({
        id: "#44c",
        title: `own ${status} Connection on inbox I, satellite on I with another identity`,
        provider,
        fixture: [I("A"), S("A", { identity: "q" }), C("A", status)],
        picker: "A",
        submit: "D",
      }),
    ),
  ),
]

/** #44: sibling Connection without a satellite whose status is not disconnected. */
const instagramGapCases: MatrixCase[] = IG_PROVIDERS.flatMap((session) =>
  (["connected", "degraded", "needs_reauth", "paused"] as const).map((status) =>
    mk({
      id: "#44",
      title: `A ${status} ${SIBLING_OF[session]} Connection, satellite absent, shared Inbox remains`,
      provider: session,
      fixture: [I("A"), C("A", status, { provider: SIBLING_OF[session] })],
      picker: "A",
      submit: "D",
    }),
  ),
)

const zaloCases: MatrixCase[] = [
  ...ACTIVE_STATUSES.map((status) =>
    mk({
      id: "#48",
      title: `B ${status} Connection with satellite`,
      provider: ZALO,
      fixture: [I("B"), S("B"), C("B", status)],
      picker: "B",
      submit: "D",
    }),
  ),
  ...INACTIVE_STATUSES.map((status) =>
    mk({
      id: "#49",
      title: `B ${status} Connection with satellite`,
      provider: ZALO,
      fixture: [I("B"), S("B"), C("B", status)],
      picker: "S",
      submit: "Fresh",
    }),
  ),
  mk({
    id: "#49",
    title: "B satellite without Connection",
    provider: ZALO,
    fixture: [I("B"), S("B")],
    picker: "S",
    submit: "Fresh",
  }),
  ...ALL_STATUSES.map((status) =>
    mk({
      id: "#50",
      title: `A ${status} Connection with satellite`,
      provider: ZALO,
      fixture: [I("A"), S("A"), C("A", status)],
      picker: isActive(status) ? "A" : "S",
      submit: isActive(status) ? "D" : "Revive",
    }),
  ),
]

/** #51: Zalo satellite in A without any Connection. */
const zaloGapCases: MatrixCase[] = [
  mk({
    id: "#51",
    title: "A satellite without Connection",
    provider: ZALO,
    fixture: [I("A"), S("A")],
    picker: "A",
    submit: "D",
  }),
]

/** #66: A's Inbox for `p` is already owned by a same-provider Connection for another account. */
const driftGapCases: MatrixCase[] = ALL_STATUSES.map((status) =>
  mk({
    id: "#66",
    title: `inbox of p owned by a ${status} Connection for another account q`,
    provider: MSG,
    fixture: [I("A"), C("A", status, { src: "q" })],
    picker: "A",
    submit: "D",
  }),
)

/** #65: two active same-provider Connections for p (A and B), no satellites; the higher id decides the scope. */
const driftCases: MatrixCase[] = [MSG, ZALO].flatMap((provider) =>
  (["A", "B"] as const).map((higher) => {
    const lower = higher === "A" ? "B" : "A"
    return mk({
      id: "#65",
      title: `active Connections in A and B, higher id in ${higher}`,
      provider,
      fixture: [I("A"), I("B"), C(lower, "connected"), C(higher, "connected")],
      picker: WS_PICKER[higher],
      submit: "D",
    })
  }),
)

describe.skipIf(!databaseUrl)("picker/connect matrix against Postgres", () => {
  vi.setConfig({ testTimeout: MATRIX_TIMEOUT_MS })

  describe("Messenger #1-#28", () => {
    test.each(messengerCases)("$name", runMatrixCase)
  })
  describe("Instagram / Instagram via Facebook #31-#43", () => {
    test.each(instagramCases)("$name", runMatrixCase)
  })
  describe("occupied Inbox the write path cannot take over #44b #44c", () => {
    test.each(occupiedInboxCases)("$name", runMatrixCase)
  })
  describe("Zalo #48-#50", () => {
    test.each(zaloCases)("$name", runMatrixCase)
  })
  describe("drift #65", () => {
    test.each(driftCases)("$name", runMatrixCase)
  })
  // The reused Inbox is already occupied in a way connect cannot revive
  // (sibling Connection, orphan satellite, Connection for another account), so
  // the picker must show this_workspace instead of offering a doomed connect.
  describe("occupied Inbox #44 #51 #66", () => {
    test.each([...instagramGapCases, ...zaloGapCases, ...driftGapCases])(
      "$name",
      runMatrixCase,
    )
  })
})

// --- end-to-end scenarios: mixed lists, concurrency, idempotency ----------------

const submitTargets = async (
  workspace: WorkspaceHandle,
  sessionId: string,
  targetIds: string[],
) =>
  await connectTargets({
    sessionId,
    workspaceId: workspace.workspaceId,
    targetIds,
    actorUserId: workspace.ownerId,
  })

const listedFresh = async (
  workspace: WorkspaceHandle,
  provider: MatrixProvider,
  candidates: ConnectionCandidate[],
) => {
  const session = await startSession(workspace, provider)
  const listed = await listFor(session, provider, candidates)
  return { session, listed }
}

const targetOf = (listed: ListedSession, id: string) =>
  listed.targets.find((t) => t.id === id)

const rowsWithSource = (snapshot: Snapshot, sourceId: string) => ({
  inboxes: snapshot.inboxes.filter((row) => row.sourceId === sourceId),
  connections: snapshot.connections.filter((row) => row.sourceId === sourceId),
  satellites: snapshot.satellites.filter(
    (row) => row[IDENTITY_COLUMN[row.table as string] as string] === sourceId,
  ),
})

const subscribedTokens = (): string[] =>
  mocks.messengerWebhookSubscribe.mock.calls.map(
    ([input]) => input.auth.tokens.accessToken,
  )

const reloadSession = async (workspace: WorkspaceHandle, sessionId: string) =>
  await connectSessionService.findByIdForWorkspace({
    id: sessionId,
    workspaceId: workspace.workspaceId,
  })

const withWorkspaces = async (
  body: (workspaces: {
    A: WorkspaceHandle
    B: WorkspaceHandle
  }) => Promise<void>,
): Promise<void> => {
  const workspaces = await seedWorkspaces()
  try {
    await body(workspaces)
  } finally {
    await cleanupSeeded(workspaces)
  }
}

const newId = (label: string): string => `${label}-${createId()}`

describe.skipIf(!databaseUrl)(
  "picker/connect scenarios against Postgres",
  () => {
    vi.setConfig({ testTimeout: MATRIX_TIMEOUT_MS })

    test("#29 mixed list: each account is classified and connected on its own token", async () => {
      await withWorkspaces(async (ws) => {
        const [p1, p2, p3, p4, p5, p6] = [1, 2, 3, 4, 5, 6].map((n) =>
          newId(`p${n}`),
        ) as [string, string, string, string, string, string]
        const seed = (fixture: FixtureItem[], p: string) =>
          seedFixture({ workspaces: ws, provider: MSG, fixture, p })
        await seed([I("B"), S("B")], p2)
        await seed([I("A"), S("A")], p3)
        const holder4 = await seed([I("A"), S("A"), C("A", "needs_reauth")], p4)
        await seed([I("B"), S("B"), C("B", "disconnected")], p5)
        const before = await snapshotOf(ws)

        const { session, listed } = await listedFresh(ws.A, MSG, [
          buildCandidate(MSG, p1),
          buildCandidate(MSG, p2),
          buildCandidate(MSG, p3),
          buildCandidate(MSG, p4),
          buildCandidate(MSG, p5),
          buildCandidate(MSG, p6, { unavailable: true }),
        ])
        const expectedPickers: Picker[] = ["S", "B", "A", "S", "B", "U"]
        for (const [index, p] of [p1, p2, p3, p4, p5, p6].entries()) {
          expectTarget(targetOf(listed, p), expectedPickers[index] as Picker)
        }
        expect(
          (await decryptStoredCandidates(listed)).map((c) => c.sourceId),
        ).toEqual([p1, p4])

        const { outcomes } = await submitTargets(ws.A, session.id, [
          p1,
          p2,
          p3,
          p4,
          p5,
          p6,
        ])
        expect(outcomes.map((o) => `${o.status}:${o.reason ?? ""}`)).toEqual([
          "connected:",
          "duplicated:alreadyConnected",
          "duplicated:alreadyConnected",
          "connected:",
          "duplicated:alreadyConnected",
          "failed:notSelectable",
        ])

        const after = await snapshotOf(ws)
        const diff = diffSnapshots(before, after)
        expectNoRemovals(diff)
        expect(diff.inboxes.added).toHaveLength(1)
        expect(diff.satellites.added).toHaveLength(1)
        expect(diff.connections.added).toHaveLength(1)
        expect(tokenInAuth(diff.satellites.added[0] as Row)).toBe(tokenOf(p1))
        expect(diff.satellites.changed.map((c) => c.after.id)).toEqual(
          holder4.satelliteIds,
        )
        expect(tokenInAuth(diff.satellites.changed[0]?.after as Row)).toBe(
          tokenOf(p4),
        )
        expect(diff.connections.changed.map((c) => c.after.id)).toEqual(
          holder4.connectionIds,
        )
        // No token crossed accounts: only p1's and p4's own tokens were used.
        expect([...subscribedTokens()].sort()).toEqual(
          [tokenOf(p1), tokenOf(p4)].sort(),
        )
      })
    })

    test("#30 a list of only blocked accounts still awaits selection; tampered submit is rejected", async () => {
      await withWorkspaces(async (ws) => {
        const [p2, p3, p5, p6] = [2, 3, 5, 6].map((n) => newId(`p${n}`)) as [
          string,
          string,
          string,
          string,
        ]
        await seedFixture({
          workspaces: ws,
          provider: MSG,
          fixture: [I("B"), S("B")],
          p: p2,
        })
        await seedFixture({
          workspaces: ws,
          provider: MSG,
          fixture: [I("A"), S("A")],
          p: p3,
        })
        await seedFixture({
          workspaces: ws,
          provider: MSG,
          fixture: [I("B"), S("B"), C("B", "disconnected")],
          p: p5,
        })
        const before = await snapshotOf(ws)

        const { session, listed } = await listedFresh(ws.A, MSG, [
          buildCandidate(MSG, p2),
          buildCandidate(MSG, p3),
          buildCandidate(MSG, p5),
          buildCandidate(MSG, p6, { unavailable: true }),
        ])
        expect(listed.status).toBe("awaiting_selection")
        expectTarget(targetOf(listed, p2), "B")
        expectTarget(targetOf(listed, p3), "A")
        expectTarget(targetOf(listed, p5), "B")
        expectTarget(targetOf(listed, p6), "U")
        expect(await decryptStoredCandidates(listed)).toEqual([])

        const { outcomes, session: after } = await submitTargets(
          ws.A,
          session.id,
          [p2, p3, p5, p6],
        )
        expect(outcomes.map((o) => `${o.status}:${o.reason}`)).toEqual([
          "duplicated:alreadyConnected",
          "duplicated:alreadyConnected",
          "duplicated:alreadyConnected",
          "failed:notSelectable",
        ])
        // Zero selectable targets: recording any result completes the session.
        expect(after.status).toBe("completed")
        expect(await snapshotOf(ws)).toEqual(before)
        expect(webhookCallCount()).toBe(0)
      })
    })

    test("#52 zalo: the same OA connects in two workspaces (no global identity constraint)", async () => {
      await withWorkspaces(async (ws) => {
        const p = newId("oa")
        const a = await listedFresh(ws.A, ZALO, [buildCandidate(ZALO, p)])
        const b = await listedFresh(ws.B, ZALO, [buildCandidate(ZALO, p)])
        expectTarget(targetOf(a.listed, p), "S")
        expectTarget(targetOf(b.listed, p), "S")

        const [resultA, resultB] = await Promise.all([
          submitTargets(ws.A, a.session.id, [p]),
          submitTargets(ws.B, b.session.id, [p]),
        ])
        expect(resultA.outcomes[0]?.status).toBe("connected")
        expect(resultB.outcomes[0]?.status).toBe("connected")

        const rows = rowsWithSource(await snapshotOf(ws), p)
        expect(rows.inboxes).toHaveLength(2)
        expect(rows.satellites).toHaveLength(2)
        expect(rows.connections).toHaveLength(2)
        expect(new Set(rows.satellites.map((row) => row.workspaceId))).toEqual(
          new Set([ws.A.workspaceId, ws.B.workspaceId]),
        )
      })
    })

    const expectSingleOwner = (snapshot: Snapshot, p: string): void => {
      const rows = rowsWithSource(snapshot, p)
      expect(rows.inboxes).toHaveLength(1)
      expect(rows.satellites).toHaveLength(1)
      expect(rows.connections).toHaveLength(1)
      expect(rows.connections[0]?.status).toBe("connected")
    }
    const outcomeStatuses = (...outcomes: ConnectSessionOutcome[]): string[] =>
      outcomes
        .map((o) =>
          o.status === "duplicated" ? `duplicated:${o.reason}` : o.status,
        )
        .sort()

    test("#53 messenger: concurrent connects from two workspaces leave exactly one owner", async () => {
      await withWorkspaces(async (ws) => {
        const p = newId("page")
        const a = await listedFresh(ws.A, MSG, [buildCandidate(MSG, p)])
        const b = await listedFresh(ws.B, MSG, [buildCandidate(MSG, p)])
        expectTarget(targetOf(a.listed, p), "S")
        expectTarget(targetOf(b.listed, p), "S")

        const [resultA, resultB] = await Promise.all([
          submitTargets(ws.A, a.session.id, [p]),
          submitTargets(ws.B, b.session.id, [p]),
        ])
        expect(
          outcomeStatuses(
            resultA.outcomes[0] as ConnectSessionOutcome,
            resultB.outcomes[0] as ConnectSessionOutcome,
          ),
        ).toEqual(["connected", "duplicated:alreadyConnected"])
        expectSingleOwner(await snapshotOf(ws), p)
        expect(webhookCallCount()).toBe(1)
      })
    })

    test("#54 messenger: two overlapping sessions in one workspace leave exactly one owner", async () => {
      await withWorkspaces(async (ws) => {
        const p = newId("page")
        const first = await listedFresh(ws.A, MSG, [buildCandidate(MSG, p)])
        const second = await listedFresh(ws.A, MSG, [buildCandidate(MSG, p)])
        const [resultOne, resultTwo] = await Promise.all([
          submitTargets(ws.A, first.session.id, [p]),
          submitTargets(ws.A, second.session.id, [p]),
        ])
        expect(
          outcomeStatuses(
            resultOne.outcomes[0] as ConnectSessionOutcome,
            resultTwo.outcomes[0] as ConnectSessionOutcome,
          ),
        ).toEqual(["connected", "duplicated:alreadyConnected"])
        expectSingleOwner(await snapshotOf(ws), p)
      })
    })

    test("#54 messenger: a second session submitted after the first committed is duplicated", async () => {
      await withWorkspaces(async (ws) => {
        const p = newId("page")
        const first = await listedFresh(ws.A, MSG, [buildCandidate(MSG, p)])
        const second = await listedFresh(ws.A, MSG, [buildCandidate(MSG, p)])
        const resultOne = await submitTargets(ws.A, first.session.id, [p])
        const before = await snapshotOf(ws)
        const resultTwo = await submitTargets(ws.A, second.session.id, [p])
        expect(resultOne.outcomes[0]?.status).toBe("connected")
        expect(resultTwo.outcomes[0]).toEqual({
          targetId: p,
          status: "duplicated",
          reason: "alreadyConnected",
        })
        expect(await snapshotOf(ws)).toEqual(before)
        expectSingleOwner(before, p)
      })
    })

    test("#55 a stale selectable listing is rejected as duplicated when a foreign orphan holder appears", async () => {
      await withWorkspaces(async (ws) => {
        const p = newId("page")
        const { session, listed } = await listedFresh(ws.A, MSG, [
          buildCandidate(MSG, p),
        ])
        expectTarget(targetOf(listed, p), "S")
        await seedFixture({
          workspaces: ws,
          provider: MSG,
          fixture: [I("B"), S("B")],
          p,
        })
        const before = await snapshotOf(ws)

        const { outcomes } = await submitTargets(ws.A, session.id, [p])
        expect(outcomes[0]).toEqual({
          targetId: p,
          status: "duplicated",
          reason: "alreadyConnected",
        })
        // No residual A Inbox: the failed attempt rolled back entirely.
        expect(await snapshotOf(ws)).toEqual(before)
        expect(webhookCallCount()).toBe(0)
      })
    })

    test("#55 a stale selectable listing is rejected as duplicated when another workspace connects first", async () => {
      await withWorkspaces(async (ws) => {
        const p = newId("page")
        const a = await listedFresh(ws.A, MSG, [buildCandidate(MSG, p)])
        const b = await listedFresh(ws.B, MSG, [buildCandidate(MSG, p)])
        expect(
          (await submitTargets(ws.B, b.session.id, [p])).outcomes[0]?.status,
        ).toBe("connected")
        const before = await snapshotOf(ws)

        const { outcomes } = await submitTargets(ws.A, a.session.id, [p])
        expect(outcomes[0]).toEqual({
          targetId: p,
          status: "duplicated",
          reason: "alreadyConnected",
        })
        expect(await snapshotOf(ws)).toEqual(before)
        expect(
          before.inboxes.filter((row) => row.workspaceId === ws.A.workspaceId),
        ).toEqual([])
      })
    })

    test("#56 a stored blocked target stays blocked after the holder disappears; a new session connects", async () => {
      await withWorkspaces(async (ws) => {
        const p = newId("page")
        const holder = await seedFixture({
          workspaces: ws,
          provider: MSG,
          fixture: [I("B"), S("B")],
          p,
        })
        const { session, listed } = await listedFresh(ws.A, MSG, [
          buildCandidate(MSG, p),
        ])
        expectTarget(targetOf(listed, p), "B")

        await db
          .delete(inboxModel)
          .where(eq(inboxModel.id, holder.inboxIds.IB as string))
        const before = await snapshotOf(ws)
        expect(rowsWithSource(before, p).satellites).toEqual([])

        const stale = await submitTargets(ws.A, session.id, [p])
        expect(stale.outcomes[0]).toEqual({
          targetId: p,
          status: "duplicated",
          reason: "alreadyConnected",
        })
        expect(await snapshotOf(ws)).toEqual(before)

        const fresh = await listedFresh(ws.A, MSG, [buildCandidate(MSG, p)])
        expectTarget(targetOf(fresh.listed, p), "S")
        const result = await submitTargets(ws.A, fresh.session.id, [p])
        expect(result.outcomes[0]?.status).toBe("connected")
      })
    })

    test("#57 the same target twice in one call connects once and reports the repeat as duplicated", async () => {
      await withWorkspaces(async (ws) => {
        const p = newId("page")
        const { session } = await listedFresh(ws.A, MSG, [
          buildCandidate(MSG, p),
        ])
        const result = await submitTargets(ws.A, session.id, [p, p])
        expect(result.outcomes[0]?.status).toBe("connected")
        expect(result.outcomes[1]).toEqual({
          targetId: p,
          status: "duplicated",
          reason: "alreadyConnected",
        })
        expect(result.connections).toHaveLength(1)
        expectSingleOwner(await snapshotOf(ws), p)
        expect(webhookCallCount()).toBe(1)
        expect(result.session.status).toBe("completed")
      })
    })

    test("#58 reselecting an already connected target in a still-open session writes nothing", async () => {
      await withWorkspaces(async (ws) => {
        const [p, q] = [newId("page"), newId("page")] as [string, string]
        const { session } = await listedFresh(ws.A, MSG, [
          buildCandidate(MSG, p),
          buildCandidate(MSG, q),
        ])
        const first = await submitTargets(ws.A, session.id, [p])
        expect(first.outcomes[0]?.status).toBe("connected")
        expect(first.session.status).toBe("awaiting_selection")
        const before = await snapshotOf(ws)

        const second = await submitTargets(ws.A, session.id, [p])
        expect(second.outcomes[0]).toEqual({
          targetId: p,
          status: "duplicated",
          reason: "alreadyConnected",
        })
        expect(await snapshotOf(ws)).toEqual(before)
        expect(webhookCallCount()).toBe(1)
      })
    })

    test("#59 submitting a completed session again is rejected as expired, not as a duplicate", async () => {
      await withWorkspaces(async (ws) => {
        const p = newId("page")
        const { session } = await listedFresh(ws.A, MSG, [
          buildCandidate(MSG, p),
        ])
        const first = await submitTargets(ws.A, session.id, [p])
        expect(first.session.status).toBe("completed")
        expect(first.session.encryptedAuth).toBeNull()
        const before = await snapshotOf(ws)

        await expect(
          submitTargets(ws.A, session.id, [p]),
        ).rejects.toMatchObject({
          code: "connectSessionExpired",
        })
        expect(await snapshotOf(ws)).toEqual(before)
      })
    })

    /** Polls until a backend is blocked by the lock holder's backend on an Inbox insert (the first connect, held before it commits). */
    const waitForBlockedBackend = async (holderPid: number): Promise<void> => {
      const deadline = Date.now() + 15_000
      while (Date.now() < deadline) {
        const result = await db.execute(
          sql`select count(*)::int as waiting from pg_stat_activity where wait_event_type = 'Lock' and ${holderPid} = any(pg_blocking_pids(pid)) and query ilike 'insert into "Inbox"%'`,
        )
        if (Number((result.rows[0] as { waiting: number }).waiting) > 0) {
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      throw new Error("the first connect never blocked on the held lock")
    }

    test("#60 one session, concurrent submissions: the second is reported in progress, never a second creation", async () => {
      await withWorkspaces(async (ws) => {
        const p = newId("page")
        const { session } = await listedFresh(ws.A, MSG, [
          buildCandidate(MSG, p),
        ])

        // An uncommitted Inbox row for (A, messenger, p) makes the first
        // connect's own Inbox insert wait on the unique index, after it has
        // already claimed the target and before anything commits.
        let release: () => void = () => undefined
        const gate = new Promise<void>((resolve) => {
          release = resolve
        })
        let holdingLock: (pid: number) => void = () => undefined
        const lockHeld = new Promise<number>((resolve) => {
          holdingLock = resolve
        })
        const lockTransaction = db
          .transaction(async (tx) => {
            const backend = await tx.execute(
              sql`select pg_backend_pid()::int as pid`,
            )
            await tx.insert(inboxModel).values({
              id: createId(),
              workspaceId: ws.A.workspaceId,
              channel: "messenger",
              sourceId: p,
              name: "lock holder",
            })
            holdingLock(Number((backend.rows[0] as { pid: number }).pid))
            await gate
            tx.rollback()
          })
          .catch(() => undefined)
        const holderPid = await lockHeld

        const first = submitTargets(ws.A, session.id, [p])
        let second: ReturnType<typeof submitTargets> | undefined
        try {
          await waitForBlockedBackend(holderPid)
          second = submitTargets(ws.A, session.id, [p])
          expect((await second).outcomes).toEqual([
            { targetId: p, status: "failed", reason: "inProgress" },
          ])
        } finally {
          release()
          await lockTransaction
          // Both submissions settle before the fixtures are cleaned up.
          await Promise.allSettled([first, second])
        }
        const firstResult = await first
        expect(firstResult.outcomes[0]?.status).toBe("connected")
        // inProgress is never persisted as a durable result.
        expect(firstResult.session.results).toEqual([
          expect.objectContaining({ targetId: p, status: "connected" }),
        ])
        expectSingleOwner(await snapshotOf(ws), p)
        expect(webhookCallCount()).toBe(1)
      })
    })

    test("#61 unknown, selectable and blocked ids in one submit are each handled on their own", async () => {
      await withWorkspaces(async (ws) => {
        const [p, q, r] = [newId("page"), newId("unknown"), newId("held")] as [
          string,
          string,
          string,
        ]
        await seedFixture({
          workspaces: ws,
          provider: MSG,
          fixture: [I("B"), S("B")],
          p: r,
        })
        const { session } = await listedFresh(ws.A, MSG, [
          buildCandidate(MSG, p),
          buildCandidate(MSG, r),
        ])
        const before = await snapshotOf(ws)

        const { outcomes } = await submitTargets(ws.A, session.id, [q, p, r])
        expect(
          outcomes.map((o) => `${o.targetId}:${o.status}:${o.reason ?? ""}`),
        ).toEqual([
          `${q}:failed:unknown`,
          `${p}:connected:`,
          `${r}:duplicated:alreadyConnected`,
        ])
        const diff = diffSnapshots(before, await snapshotOf(ws))
        expect(diff.satellites.added.map((row) => row.pageId)).toEqual([p])
        expect(diff.inboxes.added.map((row) => row.sourceId)).toEqual([p])
        expect(diff.satellites.changed).toEqual([])
        expect(subscribedTokens()).toEqual([tokenOf(p)])
      })
    })

    test("#62 a failing webhook subscribe still connects, degraded; a new session then shows it as connected", async () => {
      await withWorkspaces(async (ws) => {
        const p = newId("page")
        const { session } = await listedFresh(ws.A, MSG, [
          buildCandidate(MSG, p),
        ])
        mocks.messengerWebhookSubscribe.mockRejectedValueOnce(
          new Error("subscribe rejected"),
        )
        const { outcomes } = await submitTargets(ws.A, session.id, [p])
        expect(outcomes[0]).toMatchObject({ targetId: p, status: "connected" })
        expect((outcomes[0] as { detail?: string }).detail).toContain(
          "degraded",
        )

        const rows = rowsWithSource(await snapshotOf(ws), p)
        expect(rows.connections).toHaveLength(1)
        expect(rows.connections[0]?.status).toBe("degraded")
        expect(rows.satellites).toHaveLength(1)
        expect(rows.inboxes).toHaveLength(1)

        const again = await listedFresh(ws.A, MSG, [buildCandidate(MSG, p)])
        expectTarget(targetOf(again.listed, p), "A")
      })
    })

    test.each([
      MSG,
      IGF,
    ] as const)("#63 %s: an empty provider list fails the session with no candidates and writes nothing", async (provider) => {
      await withWorkspaces(async (ws) => {
        const unrelated = newId("held")
        await seedFixture({
          workspaces: ws,
          provider,
          fixture: [I("B"), S("B")],
          p: unrelated,
        })
        await seedFixture({
          workspaces: ws,
          provider,
          fixture: [I("A"), S("A")],
          p: newId("held"),
        })
        const before = await snapshotOf(ws)
        const session = await startSession(ws.A, provider)

        await expect(listFor(session, provider, [])).rejects.toMatchObject({
          code: "connectionNoCandidates",
        })
        const failed = await reloadSession(ws.A, session.id)
        expect(failed?.status).toBe("failed")
        expect(failed?.errorCode).toBe("no_candidates")
        expect(failed?.encryptedAuth).toBeNull()
        expect(failed?.targets).toEqual([])
        expect(await snapshotOf(ws)).toEqual(before)
      })
    })
  },
)

// --- #64: the real store bindings' identity-holder lookup ---------------------------

type BindingKey = "messenger" | "instagram" | "instagramFacebook" | "whatsapp"

const insertWhatsappSatellite = async (input: {
  workspaceId: string
  inboxId: string
  phoneNumberId: string
}): Promise<string> => {
  const id = createId()
  await db.insert(integrationWhatsappModel).values({
    id,
    workspaceId: input.workspaceId,
    inboxId: input.inboxId,
    phoneNumberId: input.phoneNumberId,
    wabaId: `waba-${input.phoneNumberId}`,
    businessId: `business-${input.phoneNumberId}`,
    name: "Matrix WhatsApp",
    auth: {} as never,
  })
  return id
}

describe.skipIf(!databaseUrl)(
  "#64 store binding findIdentityHolders against Postgres",
  () => {
    vi.setConfig({ testTimeout: MATRIX_TIMEOUT_MS })

    const seedHolder = async (input: {
      binding: BindingKey
      workspace: WorkspaceHandle
      sourceId: string
      type?: InstagramSatelliteType
    }): Promise<{ inboxId: string }> => {
      const channel: ChannelType =
        input.binding === "whatsapp"
          ? "whatsapp"
          : CHANNEL_OF[input.binding as MatrixProvider]
      const inboxId = await insertChannelInbox({
        workspaceId: input.workspace.workspaceId,
        sourceId: input.sourceId,
        channel,
        status: "connected",
      })
      if (input.binding === "whatsapp") {
        await insertWhatsappSatellite({
          workspaceId: input.workspace.workspaceId,
          inboxId,
          phoneNumberId: input.sourceId,
        })
      } else {
        await insertSatellite({
          provider: input.binding,
          workspaceId: input.workspace.workspaceId,
          inboxId,
          sourceId: input.sourceId,
          ...(input.type ? { type: input.type } : {}),
        })
      }
      return { inboxId }
    }

    test.each([
      "messenger",
      "instagram",
      "instagramFacebook",
      "whatsapp",
    ] as const)("%s: holders are found once per satellite with exact workspace, inbox and source", async (binding) => {
      await withWorkspaces(async (ws) => {
        const store = CONNECTION_STORE_BINDINGS[binding]
        const findIdentityHolders = store?.findIdentityHolders
        if (!findIdentityHolders) {
          throw new Error(`${binding} must expose findIdentityHolders`)
        }
        const [held, heldElsewhere, unknown] = [
          newId("held"),
          newId("held"),
          newId("unknown"),
        ] as [string, string, string]
        const own = await seedHolder({
          binding,
          workspace: ws.A,
          sourceId: held,
        })
        const foreign = await seedHolder({
          binding,
          workspace: ws.B,
          sourceId: heldElsewhere,
        })

        expect(await findIdentityHolders([])).toEqual([])
        expect(await findIdentityHolders([unknown])).toEqual([])
        const holders = await findIdentityHolders([
          held,
          heldElsewhere,
          unknown,
          held,
        ])
        expect(holders).toHaveLength(2)
        expect(holders).toEqual(
          expect.arrayContaining([
            {
              sourceId: held,
              workspaceId: ws.A.workspaceId,
              inboxId: own.inboxId,
              matchesBinding: true,
            },
            {
              sourceId: heldElsewhere,
              workspaceId: ws.B.workspaceId,
              inboxId: foreign.inboxId,
              matchesBinding: true,
            },
          ]),
        )
      })
    })

    test.each([
      "instagram",
      "instagramFacebook",
    ] as const)("%s: a sibling slice's satellite is reported with matchesBinding=false", async (binding) => {
      await withWorkspaces(async (ws) => {
        const findIdentityHolders =
          CONNECTION_STORE_BINDINGS[binding]?.findIdentityHolders
        const sibling = newId("sibling")
        const seeded = await seedHolder({
          binding,
          workspace: ws.A,
          sourceId: sibling,
          type: SATELLITE_TYPE_OF[SIBLING_OF[binding]],
        })
        expect(await findIdentityHolders?.([sibling])).toEqual([
          {
            sourceId: sibling,
            workspaceId: ws.A.workspaceId,
            inboxId: seeded.inboxId,
            matchesBinding: false,
          },
        ])
      })
    })

    test("zalo exposes no identity-holder lookup (no global unique index)", () => {
      expect(
        CONNECTION_STORE_BINDINGS.zalo?.findIdentityHolders,
      ).toBeUndefined()
    })
  },
)
