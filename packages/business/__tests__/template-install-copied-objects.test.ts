// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  settingsInsert: vi.fn(),
  warn: vi.fn(),
}))

const updateChain = {
  set: () => ({ where: () => Promise.resolve() }),
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ update: () => updateChain }),
    update: () => updateChain,
  },
  eq: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  templateInstallationModel: { id: "id" },
  templateInstalledResourceModel: {},
}))

vi.mock("@chatbotx.io/events", () => ({ updateTriggerCache: vi.fn() }))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { deleteObject: mocks.deleteObject },
}))

vi.mock("../src/logger", () => ({
  logger: { warn: mocks.warn, error: vi.fn(), info: vi.fn() },
}))

vi.mock("../src/ai-agent/service", () => ({ aiAgentService: {} }))
vi.mock("../src/automated-response/service", () => ({
  automatedResponseService: {},
}))
vi.mock("../src/bot-field/service", () => ({ botFieldService: {} }))
vi.mock("../src/custom-field/service", () => ({ customFieldService: {} }))
vi.mock("../src/folder", () => ({ folderService: {} }))
vi.mock("../src/template/adapters/manifests/custom-fields", () => ({
  resolveCustomFieldManifest: vi.fn(),
}))
vi.mock("../src/template/adapters/manifests/folders", () => ({
  resolveFolderManifest: vi.fn(),
}))
vi.mock("../src/template/adapters/manifests/product-categories", () => ({
  resolveProductCategoryManifest: vi.fn(),
}))
vi.mock("../src/pipeline/service", () => ({
  pipelineService: { invalidateList: vi.fn() },
}))
vi.mock("../src/template/adapters/manifests/pipelines", () => ({
  resolvePipelineManifest: vi.fn(),
}))
vi.mock("../src/template/adapters/manifests/tags", () => ({
  resolveTagManifest: vi.fn(),
}))
vi.mock("../src/template/adapters/registry", () => ({
  TEMPLATE_INSTALL_ORDER: ["settings"],
  templateAdapterRegistry: { settings: { insert: mocks.settingsInsert } },
}))

const { templateInstallService } = await import(
  "../src/template/install.service"
)

const payload = {
  manifests: {
    folders: [],
    customFields: [],
    tags: [],
    productCategories: [],
  },
  resources: {
    settings: {
      savedReplies: [{ sourceId: "reply-1", kind: "savedReply" }],
      botFields: [],
    },
  },
}

const install = () =>
  templateInstallService.run({
    installationId: "install-1",
    workspaceId: "ws-1",
    payload: payload as never,
    templateName: "Shop",
    createInstallFolder: false,
  })

describe("templateInstallService.run copied storage objects", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.deleteObject.mockResolvedValue(undefined)
  })

  test("deletes every object the aborted install copied", async () => {
    mocks.settingsInsert.mockImplementation((ctx) => {
      ctx.trackCopiedObject("public/space/ws-1/media-library/a")
      ctx.trackCopiedObject("public/space/ws-1/media-library/b")
      throw new Error("adapter failed")
    })

    await expect(install()).rejects.toThrow("adapter failed")

    expect(mocks.deleteObject.mock.calls.map((call) => call[0])).toEqual([
      "public/space/ws-1/media-library/a",
      "public/space/ws-1/media-library/b",
    ])
  })

  test("still reports the install error when a cleanup delete fails", async () => {
    mocks.deleteObject.mockRejectedValue(new Error("storage down"))
    mocks.settingsInsert.mockImplementation((ctx) => {
      ctx.trackCopiedObject("public/space/ws-1/media-library/a")
      throw new Error("adapter failed")
    })

    await expect(install()).rejects.toThrow("adapter failed")
    expect(mocks.warn).toHaveBeenCalled()
  })
})
