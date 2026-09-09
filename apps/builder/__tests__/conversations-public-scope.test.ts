// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
}))

const conversationService = {
  findWithFullRelations: vi.fn(),
  findByOrFail: vi.fn(),
  updateReadStatus: vi.fn(),
}

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  conversationService,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn().mockResolvedValue({
    findLastByConversation: vi.fn().mockResolvedValue([]),
  }),
}))

vi.mock("@chatbotx.io/business/ads-conversion/channel-fields", () => ({
  resolveAdReferral: () => null,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  assertApiNotRateLimited,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/lib/workspace-quota", () => ({
  assertWorkspaceNotBlocked: vi.fn(),
}))

vi.mock("@/env", () => ({ isCloud: () => true }))

// `@/orpc` also exports `authorizedAPI`, which pulls in the full better-auth
// stack via `authMiddleware` — irrelevant here and unsafe to initialize in a
// unit test. Same stub as workspace-token-scope-enforcement.test.ts.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
}))

// The conversations public router also imports the conversation action
// files (assign/archive/follow/etc.) for its write routes, and those pull in
// `@/lib/safe-action` → `@/lib/auth/utils` → the real better-auth instance —
// same problem as `authMiddleware` above, one level removed. Stub the one
// export those actions actually need.
vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserId: vi.fn(),
}))

const { call } = await import("@orpc/server")
const { conversationsPublicRouter } = await import(
  "../src/features/conversations/api/public"
)

const TOKEN = "cbx_ws_fixture"

const authResult = (scopes: string[] | null) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission: "full" as const, scopes },
})

// A full `ConversationWithFullRelations` row — the `getConversationPublicResponse`
// output schema is the strict `listConversationsItemResource` (see
// schema/resource.ts), so every column must be present.
const buildConversationFixture = () => ({
  id: "1",
  workspaceId: "ws-1",
  contactId: "contact-1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  botEnabled: true,
  botResumeAt: null,
  archivedAt: null,
  additionalAttributes: null,
  contactLastReadAt: null,
  agentLastReadAt: null,
  aiContextLastMessageId: null,
  followed: false,
  assignedUserId: null,
  assignedInboxTeamId: null,
  sourceId: null,
  lastStep: null,
  currentStep: null,
  adminRepliedAt: null,
  contactRepliedAt: null,
  lastActivityAt: null,
  contactInboxes: [],
  messages: [],
  contact: null,
  assignedUser: null,
  assignedInboxTeam: null,
})

const invoke = (procedure: typeof conversationsPublicRouter.get) =>
  call(
    procedure,
    { id: "1" },
    {
      context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
    },
  )

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("real router: conversations public API scope wiring", () => {
  test("a contacts-scoped token is denied the real GET /v1/conversations/{id} route with FORBIDDEN", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

    await expect(invoke(conversationsPublicRouter.get)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'inbox' scope",
    })
  })

  test("null scopes (unrestricted) passes the real GET /v1/conversations/{id} route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    conversationService.findWithFullRelations.mockResolvedValue(
      buildConversationFixture(),
    )

    await expect(invoke(conversationsPublicRouter.get)).resolves.toMatchObject({
      data: { id: "1" },
    })
  })

  test("an inbox-scoped token passes the real GET /v1/conversations/{id} route", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["inbox"]))
    conversationService.findWithFullRelations.mockResolvedValue(
      buildConversationFixture(),
    )

    await expect(invoke(conversationsPublicRouter.get)).resolves.toMatchObject({
      data: { id: "1" },
    })
  })
})
