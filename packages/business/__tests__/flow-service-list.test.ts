// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listWithVersions: vi.fn(),
  count: vi.fn(),
  findIntegration: vi.fn(),
  listTemplateIds: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: {}, eq: vi.fn() }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  flowRepository: {
    listWithVersions: mocks.listWithVersions,
    count: mocks.count,
  },
  integrationWhatsappRepository: {
    findByIdForWorkspace: mocks.findIntegration,
  },
  whatsappMessageTemplateRepository: {
    listIdsByIntegration: mocks.listTemplateIds,
  },
}))
vi.mock("@chatbotx.io/database/partials", () => ({ rootFolderId: "0" }))
vi.mock("@chatbotx.io/database/schema", () => ({}))
vi.mock("@chatbotx.io/utils", () => ({ createId: vi.fn() }))
vi.mock("@chatbotx.io/flow-config", () => ({
  stepTypes: { enum: { sendWaTemplateMessage: "sendWaTemplateMessage" } },
}))
// The start-node matching itself is covered by the filters' own tests; here a
// flow "matches" when its `match` flag says so, and template filtering keeps
// the flows whose `templateId` is in the bound list.
vi.mock("../src/flow/filters", () => ({
  filterFlowsByStartStepType: (flows: { match: boolean }[]) =>
    flows.filter((flow) => flow.match),
  filterFlowsByTemplateIds: (
    flows: { templateId: string }[],
    templateIds: string[],
  ) => flows.filter((flow) => templateIds.includes(flow.templateId)),
}))
vi.mock("../src/base.service", () => ({ BaseService: class {} }))
vi.mock("../src/errors", () => ({
  notFoundException: (message: string) =>
    Object.assign(new Error(message), { code: "notFound" }),
}))
vi.mock("../src/flow-version", () => ({
  assertFlowGraphPublishable: vi.fn(),
  flowVersionService: {},
}))
vi.mock("../src/bot-field/service", () => ({ botFieldService: {} }))
vi.mock("../src/custom-field/service", () => ({ customFieldService: {} }))
vi.mock("../src/folder/service", () => ({ folderService: {} }))
vi.mock("../src/template/installed-resource.service", () => ({
  assertDeletable: vi.fn(),
}))

const { flowService } = await import("../src/flow/service")

const flow = (id: string, match: boolean, templateId = "") => ({
  id,
  match,
  templateId,
  flowVersions: [],
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("flowService.list", () => {
  test("pages in SQL and counts with the repository without startType", async () => {
    mocks.listWithVersions.mockResolvedValue([flow("1", true)])
    mocks.count.mockResolvedValue(45)

    const result = await flowService.list({
      workspaceId: "ws-1",
      page: 2,
      perPage: 20,
    })

    expect(mocks.listWithVersions).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, perPage: 20 }),
    )
    expect(result.pageCount).toBe(3)
  })

  test("with startType, filters every matching flow and pages afterwards", async () => {
    mocks.listWithVersions.mockResolvedValue([
      flow("1", true),
      flow("2", false),
      flow("3", true),
      flow("4", true),
    ])

    const result = await flowService.list({
      workspaceId: "ws-1",
      page: 2,
      perPage: 2,
      startType: "sendMessengerTemplateMessage",
    })

    expect(mocks.listWithVersions).toHaveBeenCalledWith(
      expect.objectContaining({ page: null, perPage: null }),
    )
    expect(mocks.count).not.toHaveBeenCalled()
    expect(result.data.map((item) => item.id)).toEqual(["4"])
    expect(result.pageCount).toBe(2)
  })

  test("a WhatsApp template filter needs a channel of this workspace", async () => {
    mocks.listWithVersions.mockResolvedValue([flow("1", true, "t-1")])
    mocks.findIntegration.mockResolvedValue(null)

    await expect(
      flowService.list({
        workspaceId: "ws-1",
        startType: "sendWaTemplateMessage",
        integrationWhatsappId: "99",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.findIntegration).toHaveBeenCalledWith({
      id: "99",
      workspaceId: "ws-1",
    })
    expect(mocks.listTemplateIds).not.toHaveBeenCalled()
  })

  test("keeps the flows whose template belongs to the channel", async () => {
    mocks.listWithVersions.mockResolvedValue([
      flow("1", true, "t-1"),
      flow("2", true, "t-2"),
    ])
    mocks.findIntegration.mockResolvedValue({ id: "42" })
    mocks.listTemplateIds.mockResolvedValue(["t-2"])

    const result = await flowService.list({
      workspaceId: "ws-1",
      startType: "sendWaTemplateMessage",
      integrationWhatsappId: "42",
    })

    expect(result.data.map((item) => item.id)).toEqual(["2"])
  })

  test("a WhatsApp template filter without a channel matches nothing", async () => {
    mocks.listWithVersions.mockResolvedValue([flow("1", true, "t-1")])

    const result = await flowService.list({
      workspaceId: "ws-1",
      startType: "sendWaTemplateMessage",
    })

    expect(result.data).toEqual([])
    expect(mocks.findIntegration).not.toHaveBeenCalled()
  })
})
