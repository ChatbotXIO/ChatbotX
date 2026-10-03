// @vitest-environment node

import {
  sendMessageNodeDefaultFn,
  sendVideoStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { afterEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  dbTransaction: vi.fn(),
  ensureFolderExists: vi.fn(),
  insert: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: mocks.insert,
    query: { flowModel: { findFirst: vi.fn() } },
    transaction: mocks.dbTransaction,
    update: vi.fn(),
  },
  eq: vi.fn(),
  inArray: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({ rootFolderId: "0" }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  flowRepository: { listIdsByIds: vi.fn(), listPublishedOptions: vi.fn() },
  whatsappMessageTemplateRepository: { listIdsByIntegration: vi.fn() },
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  flowAnalyticsSessionModel: {},
  flowModel: {},
  flowVersionModel: {},
}))
vi.mock("../src/base.service", () => ({
  BaseService: class BaseService {
    audit = vi.fn()
  },
}))
vi.mock("../src/bot-field/service", () => ({
  botFieldService: { resolveByNameAndType: vi.fn() },
}))
vi.mock("../src/custom-field/service", () => ({
  customFieldService: { resolveByNameAndType: vi.fn() },
}))
vi.mock("../src/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))
vi.mock("../src/folder/service", () => ({
  folderService: { ensureExists: mocks.ensureFolderExists },
}))
vi.mock("../src/template/installed-resource.service", () => ({
  assertDeletable: vi.fn(),
}))
// flow-version/service imports these for quick reply cleanup on publish.
vi.mock("../src/conversation/service", () => ({ conversationService: {} }))
vi.mock("../src/smart-delay/service", () => ({ smartDelayService: {} }))
vi.mock("../src/flow-version", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/flow-version")>()),
  flowVersionService: { findDraft: vi.fn(), invalidateList: vi.fn() },
}))

const { flowService } = await import("../src/flow/service")

const incompatibleGraph = () => {
  const node = sendMessageNodeDefaultFn({})
  node.data.details.beforeStep.channel = "tiktok"
  node.data.details.steps = [sendVideoStepDefaultFn()]

  return { edges: [], nodes: [node], startNodeId: node.id }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("flow publishability enforcement", () => {
  test("rejects createPublished before folder and database side effects", async () => {
    await expect(
      flowService.createPublished({
        workspaceId: "workspace-1",
        data: { folderId: "folder-1", name: "Unsupported" },
        graph: incompatibleGraph(),
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        "The tiktok channel does not support sendVideo.",
      ),
      name: "FlowAuthoringException",
    })

    expect(mocks.ensureFolderExists).not.toHaveBeenCalled()
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  test("rejects createFromImport before database side effects", () => {
    const graph = incompatibleGraph()

    expect(() =>
      flowService.createFromImport({
        workspaceId: "workspace-1",
        name: "Unsupported",
        active: true,
        enableInInbox: true,
        ...graph,
      }),
    ).toThrow("The tiktok channel does not support sendVideo.")

    expect(mocks.dbTransaction).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
