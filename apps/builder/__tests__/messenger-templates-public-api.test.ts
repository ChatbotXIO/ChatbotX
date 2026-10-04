// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

type CapturedProcedure = {
  route: { method: string; path: string }
  handler?: (...args: any[]) => any
}

const { orpcMock, capturedProcedures, scopes } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const scopes: string[] = []
  const api = {
    route: (config: CapturedProcedure["route"]) => {
      const record: CapturedProcedure = { route: config }
      capturedProcedures.push(record)
      const chain: Record<string, unknown> = {}
      for (const name of ["input", "output", "errors"]) {
        chain[name] = () => chain
      }
      chain.handler = (fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }
      return chain
    },
  }
  return {
    capturedProcedures,
    scopes,
    orpcMock: {
      workspaceTokenAuthAPIForScope: (scope: string) => {
        scopes.push(scope)
        return api
      },
    },
  }
})
vi.mock("@/orpc", () => orpcMock)

const mocks = vi.hoisted(() => ({
  templateList: vi.fn(),
  templateFind: vi.fn(),
  templateDelete: vi.fn(),
  findIntegration: vi.fn(),
  listPages: vi.fn(),
  createTemplate: vi.fn(),
  cloneTemplate: vi.fn(),
  syncTemplates: vi.fn(),
  invalidate: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  messengerMessageTemplateService: {
    list: mocks.templateList,
    findByIdForWorkspace: mocks.templateFind,
    delete: mocks.templateDelete,
  },
  messengerIntegrationService: {
    findByIdForWorkspace: mocks.findIntegration,
    listByWorkspaceIdOrId: mocks.listPages,
  },
}))
vi.mock(
  "@/features/integration-messenger/message-templates/lib/message-template-operations",
  () => ({
    createMessengerMessageTemplate: mocks.createTemplate,
    cloneMessengerMessageTemplate: mocks.cloneTemplate,
    syncMessengerMessageTemplatesForIntegration: mocks.syncTemplates,
    invalidateMessengerTemplatesCache: mocks.invalidate,
  }),
)
vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})
vi.mock("@chatbotx.io/database/repositories", () => {
  const nested: unknown = new Proxy(
    {},
    { get: (_o, prop) => (prop === "then" ? undefined : nested) },
  )
  return new Proxy(
    {},
    { get: (_o, prop) => (prop === "then" ? undefined : nested) },
  ) as Record<string, unknown>
})

await import("@/features/integration-messenger/message-templates/api/public")

const find = (method: string, path: string) =>
  capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )?.handler
const context = { workspace: { id: "ws-1" } }
const template = {
  id: "t-1",
  name: "promo",
  language: "vi",
  category: "MARKETING",
  parameterFormat: "POSITIONAL",
  components: [],
  integrationMessengerId: "im-1",
  integrationMessenger: { id: "im-1", pageId: "page-1", workspaceId: "ws-1" },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.templateFind.mockResolvedValue(template)
  mocks.findIntegration.mockResolvedValue({ id: "im-1", workspaceId: "ws-1" })
})

describe("Messenger template routes", () => {
  test("use the same scope as the WhatsApp templates", () => {
    expect(new Set(scopes)).toEqual(new Set(["broadcasts"]))
  })

  test("list is scoped to the token's workspace", async () => {
    mocks.templateList.mockResolvedValue([])

    await find(
      "GET",
      "/v1/messenger/templates",
    )?.({
      context,
      input: { status: "APPROVED" },
    })

    expect(mocks.templateList).toHaveBeenCalledWith({
      where: { status: "APPROVED", workspaceId: "ws-1" },
    })
  })

  test("get and delete resolve the template inside the workspace only", async () => {
    mocks.templateFind.mockResolvedValue(undefined)

    await expect(
      find(
        "GET",
        "/v1/messenger/templates/{id}",
      )?.({
        context,
        input: { id: "t-x" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    await expect(
      find(
        "DELETE",
        "/v1/messenger/templates/{id}",
      )?.({
        context,
        input: { id: "t-x" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(mocks.templateFind).toHaveBeenCalledWith({
      id: "t-x",
      workspaceId: "ws-1",
    })
    expect(mocks.templateDelete).not.toHaveBeenCalled()
  })

  test("delete removes only the local row and drops the cache", async () => {
    await find(
      "DELETE",
      "/v1/messenger/templates/{id}",
    )?.({
      context,
      input: { id: "t-1" },
    })

    expect(mocks.templateDelete).toHaveBeenCalledWith({
      id: "t-1",
      integrationMessengerId: "im-1",
    })
    expect(mocks.invalidate).toHaveBeenCalledWith(["ws-1"])
  })

  test("create reports Meta's rejection instead of failing", async () => {
    mocks.createTemplate.mockResolvedValue({
      id: "meta-1",
      status: "REJECTED",
      rejectionReason: "INVALID_FORMAT",
    })

    const result = await find(
      "POST",
      "/v1/messenger-channels/{id}/templates",
    )?.({
      context,
      input: { id: "im-1", name: "promo", language: "vi", body: "Hi" },
    })

    expect(result).toEqual({
      id: "meta-1",
      status: "REJECTED",
      rejectionReason: "INVALID_FORMAT",
      specificRejectionReason: null,
    })
    expect(mocks.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
    )
  })

  test("create on a channel of another workspace is a 404 before anything is sent", async () => {
    mocks.findIntegration.mockResolvedValue(undefined)

    await expect(
      find(
        "POST",
        "/v1/messenger-channels/{id}/templates",
      )?.({
        context,
        input: { id: "im-foreign", name: "promo", language: "vi", body: "Hi" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.createTemplate).not.toHaveBeenCalled()
  })

  test("clone only targets pages of the token's workspace and never the source Page", async () => {
    mocks.listPages.mockResolvedValue([
      { id: "im-1", pageId: "page-1", workspaceId: "ws-1" },
      { id: "im-2", pageId: "page-2", workspaceId: "ws-1" },
      { id: "im-3", pageId: "page-3", workspaceId: "ws-1" },
    ])
    mocks.cloneTemplate.mockResolvedValue({ succeeded: [], failed: [] })

    await find(
      "POST",
      "/v1/messenger/templates/{id}/clone",
    )?.({
      context,
      // im-1 is the source Page; im-foreign is not in the workspace.
      input: {
        id: "t-1",
        targetIntegrationMessengerIds: ["im-1", "im-2", "im-foreign"],
      },
    })

    expect(mocks.listPages).toHaveBeenCalledWith({ workspaceId: "ws-1" })
    expect(mocks.cloneTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [{ id: "im-2", pageId: "page-2", workspaceId: "ws-1" }],
      }),
    )
  })

  test("clone with no valid target is refused", async () => {
    mocks.listPages.mockResolvedValue([
      { id: "im-1", pageId: "page-1", workspaceId: "ws-1" },
    ])

    await expect(
      find(
        "POST",
        "/v1/messenger/templates/{id}/clone",
      )?.({
        context,
        input: { id: "t-1", targetIntegrationMessengerIds: ["im-1"] },
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.cloneTemplate).not.toHaveBeenCalled()
  })

  test("sync pulls from Meta for a channel of the workspace and drops the cache", async () => {
    await find(
      "POST",
      "/v1/messenger-channels/{id}/templates/sync",
    )?.({
      context,
      input: { id: "im-1" },
    })

    expect(mocks.syncTemplates).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationMessenger: { id: "im-1", workspaceId: "ws-1" },
    })
    expect(mocks.invalidate).toHaveBeenCalledWith(["ws-1"])
  })
})
