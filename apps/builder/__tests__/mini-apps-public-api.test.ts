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

vi.mock("@chatbotx.io/business", () => ({
  workspaceApiTokenService: { findWorkspaceByTokenHash },
  isWorkspaceScheduledForDeletion,
  userQuotaService: { getAccessState },
  quotaEnforcementService: { isAtLimit },
}))

const miniAppService = {
  list: vi.fn(),
  findOrFail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
}
const miniAppSubmissionService = { list: vi.fn() }

vi.mock("@chatbotx.io/business/mini-app", async () => {
  const { fromFlowJson } = await vi.importActual<
    typeof import("@chatbotx.io/mini-app")
  >("@chatbotx.io/mini-app")
  return {
    miniAppService,
    miniAppSubmissionService,
    importMiniAppFlowJson: fromFlowJson,
  }
})

const publishMiniAppToWhatsapp = vi.fn()
vi.mock("@/features/mini-apps/lib/publish-to-whatsapp", () => ({
  publishMiniAppToWhatsapp,
}))
vi.mock("@/features/mini-apps/lib/public-url", () => ({
  buildMiniAppPublicUrl: (id: string) => `url:${id}`,
}))
vi.mock("@/lib/log", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/rate-limit/api-rate-limit", () => ({ assertApiNotRateLimited }))
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))
vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("@/middlewares/auth", () => ({ authMiddleware: vi.fn() }))

const { call } = await import("@orpc/server")
const { miniAppsPublicRouter } = await import(
  "../src/features/mini-apps/api/public"
)

const flowJson = {
  version: "7.3",
  screens: [
    {
      id: "WELCOME",
      title: "Welcome",
      terminal: true,
      layout: {
        type: "SingleColumnLayout",
        children: [
          { type: "TextInput", name: "full_name", label: "Full name" },
          {
            type: "Footer",
            label: "Done",
            "on-click-action": { name: "complete", payload: {} },
          },
        ],
      },
    },
  ],
}

const authResult = (
  scopes: string[] | null,
  permission: "full" | "read_only" = "full",
) => ({
  workspace: { id: "ws-1", ownerId: "owner-1" },
  apiToken: { id: "token-1", permission, scopes },
})

const invoke = (procedure: unknown, input: unknown = {}) =>
  call(procedure as Parameters<typeof call>[0], input, {
    context: {
      headers: new Headers({ Authorization: "Bearer cbx_ws_fixture" }),
    },
  })

const storedMiniApp = (definition: unknown) => ({
  id: "10",
  workspaceId: "ws-1",
  name: "Survey",
  enabled: true,
  submissionsCount: 0,
  definition,
  flowJson,
  createdAt: new Date(),
  updatedAt: new Date(),
  publications: [],
})

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
})

describe("Mini Apps public API", () => {
  test("a token without the mini-apps scope is denied", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["contacts"]))
    await expect(invoke(miniAppsPublicRouter.list)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token is not authorized for the 'mini-apps' scope",
    })
    expect(miniAppService.list).not.toHaveBeenCalled()
  })

  test("list maps the name filter and scopes to the token's workspace", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["mini-apps"]))
    miniAppService.list.mockResolvedValue({
      data: [storedMiniApp({ screens: [] })],
      pageCount: 1,
    })
    const result = await invoke(miniAppsPublicRouter.list, { name: "Sur" })
    expect(miniAppService.list).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", keyword: "Sur" }),
    )
    expect(result).toMatchObject({
      data: [{ id: "10", publicUrl: "url:10" }],
      pageCount: 1,
    })
  })

  test("create converts Flow JSON to a definition and returns validation", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    miniAppService.create.mockImplementation(
      async (input: { definition: unknown }) => storedMiniApp(input.definition),
    )
    const result = (await invoke(miniAppsPublicRouter.create, {
      name: "Survey",
      flowJson,
    })) as {
      validation: { valid: boolean }
    }
    const [createInput] = miniAppService.create.mock.calls[0] as [
      { workspaceId: string; definition: { screens: { id: string }[] } },
    ]
    expect(createInput.workspaceId).toBe("ws-1")
    expect(createInput.definition.screens[0]?.id).toBe("WELCOME")
    expect(result.validation.valid).toBe(true)
  })

  test("validate reports issues with Flow JSON paths", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(["mini-apps"]))
    const broken = structuredClone(flowJson)
    const input = broken.screens[0]?.layout.children[0] as Record<
      string,
      unknown
    >
    input.label = "This label is far too long for Meta"
    const result = (await invoke(miniAppsPublicRouter.validate, {
      flowJson: broken,
    })) as {
      valid: boolean
      issues: { code: string; path?: string }[]
    }
    expect(result.valid).toBe(false)
    expect(result.issues[0]).toMatchObject({
      code: "property_too_long",
      path: "screens[0].layout.children[0]",
    })
  })

  test("a read_only token cannot create or publish", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null, "read_only"))
    await expect(
      invoke(miniAppsPublicRouter.create, { name: "x", flowJson }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    await expect(
      invoke(miniAppsPublicRouter.publishWhatsapp, {
        id: "10",
        integrationWhatsappId: "5",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(miniAppService.create).not.toHaveBeenCalled()
    expect(publishMiniAppToWhatsapp).not.toHaveBeenCalled()
  })

  test("a new Flow JSON keeps existing custom field mappings by input name", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    const { fromFlowJson, applyCustomFieldMappings } = await vi.importActual<
      typeof import("@chatbotx.io/mini-app")
    >("@chatbotx.io/mini-app")
    const current = applyCustomFieldMappings(fromFlowJson(flowJson as never), {
      full_name: "77",
    })
    miniAppService.findOrFail.mockResolvedValue(storedMiniApp(current))
    miniAppService.update.mockResolvedValue(undefined)

    await invoke(miniAppsPublicRouter.update, { id: "10", flowJson })

    const [, data] = miniAppService.update.mock.calls[0] as [
      unknown,
      { definition: Parameters<typeof applyCustomFieldMappings>[0] },
    ]
    const { collectCustomFieldMappings } = await vi.importActual<
      typeof import("@chatbotx.io/mini-app")
    >("@chatbotx.io/mini-app")
    expect(collectCustomFieldMappings(data.definition)).toEqual({
      full_name: "77",
    })
  })

  test("submissions check the Mini App belongs to the token's workspace first", async () => {
    findWorkspaceByTokenHash.mockResolvedValue(authResult(null))
    miniAppService.findOrFail.mockRejectedValue(new Error("not found"))
    await expect(
      invoke(miniAppsPublicRouter.listSubmissions, { id: "99" }),
    ).rejects.toBeDefined()
    expect(miniAppService.findOrFail).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "99",
    })
    expect(miniAppSubmissionService.list).not.toHaveBeenCalled()
  })
})
