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

const { qrCodeService } = vi.hoisted(() => ({
  qrCodeService: {
    list: vi.fn(),
    findOrFail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
  qrCodeService,
  fbCommentAutomationService: {
    list: vi.fn(),
    listIgComments: vi.fn(),
    findMessengerOrFail: vi.fn(),
    findInstagramOrFail: vi.fn(),
    createMessenger: vi.fn(),
    createInstagram: vi.fn(),
    updateMessenger: vi.fn(),
    updateInstagram: vi.fn(),
    deleteMessenger: vi.fn(),
    deleteInstagram: vi.fn(),
  },
  igStoryAutomationService: {
    list: vi.fn(),
    findOrFail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  questionnaireService: {
    list: vi.fn(),
    getForEdit: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    rename: vi.fn(),
    duplicate: vi.fn(),
    deleteMany: vi.fn(),
  },
  questionnaireSubmissionService: {
    list: vi.fn(),
    detail: vi.fn(),
    dashboard: vi.fn(),
    deleteSubmission: vi.fn(),
  },
  spreadsheetService: {
    list: vi.fn(),
    findByWorkspaceIdOrFail: vi.fn(),
    deleteMany: vi.fn(),
  },
  facebookLeadAdsAutomationService: {
    list: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
}))

// The routers reach these channel/Google helpers directly; none of them may be
// hit by a rejected call, so they stay bare mocks.
vi.mock("@/features/fb-comments/lib/facebook-posts", () => ({
  listFacebookPostsForAutomation: vi.fn(),
}))
vi.mock("@/features/ig-comments/lib/instagram-media", () => ({
  listInstagramFacebookMedia: vi.fn(),
  listInstagramLoginMedia: vi.fn(),
}))
vi.mock("@/features/ig-stories/lib/instagram-stories", () => ({
  listInstagramFacebookStories: vi.fn(),
  listInstagramLoginStories: vi.fn(),
}))
vi.mock("@/features/spreadsheets/lib/google-sheets", () => ({
  listWorksheets: vi.fn(),
  listWorksheetHeaders: vi.fn(),
}))
vi.mock("@/features/spreadsheets/lib/manage-spreadsheet", () => ({
  createSpreadsheet: vi.fn(),
  updateSpreadsheet: vi.fn(),
}))
vi.mock("@/features/facebook-lead-ad-automation/lib/create-automation", () => ({
  createLeadAdAutomation: vi.fn(),
}))
vi.mock("@/features/facebook-lead-ad-automation/lib/pages", () => ({
  listEligibleLeadAdsPages: vi.fn(),
  listPageLeadForms: vi.fn(),
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

vi.mock("@/env", () => ({ isCloud: () => true }))

vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
}))

// Dynamic import required: `vi.mock` above is hoisted, and only a dynamic
// `import()` after registration resolves to the mocked module — a static
// top-level import would race the mock and pull in the real module (in
// particular the full better-auth stack behind `@/orpc`'s other exports).
const { call } = await import("@orpc/server")
const { fbCommentsPublicRouter } = await import(
  "../src/features/fb-comments/api/public"
)
const { igCommentsPublicRouter } = await import(
  "../src/features/ig-comments/api/public"
)
const { igStoriesPublicRouter } = await import(
  "../src/features/ig-stories/api/public"
)
const { qrCodesPublicRouter } = await import(
  "../src/features/qr-codes/api/public"
)
const { questionnairesPublicRouter } = await import(
  "../src/features/questionnaires/api/public"
)
const { spreadsheetsPublicRouter } = await import(
  "../src/features/spreadsheets/api/public"
)
const { facebookLeadAdsPublicRouter } = await import(
  "../src/features/facebook-lead-ad-automation/api/public"
)

const TOKEN = "cbx_ws_fixture"
const DENIED_MESSAGE = "Token is not authorized for the 'automation' scope"

const authResult = (scopes: string[] | null) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission: "full" as const, scopes },
})

// Exercises every procedure in a router, whose input/output shapes are all
// different — the scope middleware runs ahead of input validation, so one
// superset payload reaches the rejection for every route.
const invoke = (procedure: unknown, input: unknown = {}) =>
  call(procedure as Parameters<typeof call>[0], input, {
    context: { headers: new Headers({ Authorization: `Bearer ${TOKEN}` }) },
  })

const SUPERSET_INPUT = {
  id: "1",
  name: "x",
  spreadsheetId: "1",
  worksheetName: "Sheet1",
  questionnaireId: "1",
  submissionId: "1",
  variant: "instagram",
  pageId: "1",
  formId: "1",
}

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

// Every procedure in each of these routers must be built from
// `workspaceTokenAuthAPIForScope("automation")`. A route wired to the wrong
// scope — or to an unscoped client by mistake — would silently accept a
// contacts-scoped token here. Iterating every key means a newly added
// procedure is covered automatically without a matching test being written by
// hand.
const routers = {
  "fb-comments": fbCommentsPublicRouter,
  "ig-comments": igCommentsPublicRouter,
  "ig-stories": igStoriesPublicRouter,
  "qr-codes": qrCodesPublicRouter,
  questionnaires: questionnairesPublicRouter,
  spreadsheets: spreadsheetsPublicRouter,
  "facebook-lead-ads": facebookLeadAdsPublicRouter,
} as const

for (const [name, router] of Object.entries(routers)) {
  describe(`real router: ${name} public API scope wiring`, () => {
    const routeKeys = Object.keys(router)

    test("exports at least one procedure", () => {
      expect(routeKeys.length).toBeGreaterThan(0)
    })

    test.each(
      routeKeys,
    )("a contacts-scoped token is denied %s with FORBIDDEN", async (key) => {
      findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))

      await expect(
        invoke((router as Record<string, unknown>)[key], SUPERSET_INPUT),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: DENIED_MESSAGE,
      })
    })
  })
}

describe("workspace id derivation", () => {
  test("GET /v1/qr-codes passes the token's workspace, not a client-supplied one", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    qrCodeService.list.mockResolvedValue({ data: [], pageCount: 0 })

    await invoke(qrCodesPublicRouter.list, {
      workspaceId: "ws-attacker",
      page: 1,
      perPage: 10,
    })

    expect(qrCodeService.list).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
    )
    expect(qrCodeService.list).not.toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-attacker" }),
    )
  })

  test("an automation-scoped token passes GET /v1/qr-codes", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["automation"]))
    qrCodeService.list.mockResolvedValue({ data: [], pageCount: 0 })

    await expect(
      invoke(qrCodesPublicRouter.list, { page: 1, perPage: 10 }),
    ).resolves.toMatchObject({ data: [], pageCount: 0 })
  })
})
