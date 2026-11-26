import { beforeEach, describe, expect, test, vi } from "vitest"

const { findFirst, assertResourceEditable, lockedTransaction, record } =
  vi.hoisted(() => ({
    findFirst: vi.fn(),
    assertResourceEditable: vi.fn(),
    lockedTransaction: vi.fn(),
    record: vi.fn(),
  }))

const tx = { query: { miniAppModel: { findFirst } } }

vi.mock("../src/template/template-resource-locks", () => ({
  withTemplateLockedTransaction: async (
    run: (tx: unknown) => unknown,
    options: unknown,
  ) => {
    lockedTransaction(options)
    return await run(tx)
  },
}))
vi.mock("../src/template/installed-resource.service", () => ({
  assertResourceEditable,
  changedKeysOf: vi.fn(),
  withDeleteGuard: vi.fn(),
}))
vi.mock("../src/mini-app/publication-service", () => ({
  miniAppPublicationService: { record },
}))
vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  db: {},
  eq: vi.fn(),
  inArray: vi.fn(),
  isUniqueViolationError: vi.fn(),
  sql: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  miniAppModel: {},
  miniAppPublicationModel: {},
  miniAppSubmissionModel: {},
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  miniAppRepository: {},
  miniAppSubmissionRepository: {},
}))
vi.mock("../src/contact/service", () => ({ contactService: {} }))
vi.mock("../src/contact-custom-field/service", () => ({
  contactCustomFieldService: {},
}))
vi.mock("../src/mini-app/upload-service", () => ({ miniAppUploadService: {} }))

const { miniAppService } = await import("../src/mini-app/service")

const scope = { workspaceId: "ws-1", id: "7" }
const publication = {
  integrationWhatsappId: "wa-1",
  whatsappFlowId: "10",
  sourceId: "flow-1",
  status: "PUBLISHED",
  validationErrors: [],
  published: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  findFirst.mockResolvedValue({ id: "7", workspaceId: "ws-1" })
  record.mockResolvedValue({ id: "pub-1" })
})

describe("miniAppService publication guards", () => {
  test("assertAcceptsPublication locks the Mini App and refuses a tombstoned copy", async () => {
    assertResourceEditable.mockRejectedValueOnce(new Error("uninstalling"))

    await expect(
      miniAppService.assertAcceptsPublication(scope),
    ).rejects.toThrow("uninstalling")

    expect(lockedTransaction).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      initialKeys: [{ kind: "miniApp", resourceId: "7" }],
    })
    expect(assertResourceEditable).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceKind: "miniApp",
        resourceIds: ["7"],
        changedKeys: [],
      }),
    )
  })

  test("recordPublication records inside the locked transaction", async () => {
    await expect(
      miniAppService.recordPublication(scope, publication),
    ).resolves.toEqual({ id: "pub-1" })

    expect(record).toHaveBeenCalledWith({ ...publication, miniAppId: "7" }, tx)
  })

  test("recordPublication refuses without recording when the Mini App was deleted meanwhile", async () => {
    findFirst.mockResolvedValue(undefined)

    await expect(
      miniAppService.recordPublication(scope, publication),
    ).rejects.toThrow("Mini App not found")
    expect(record).not.toHaveBeenCalled()
  })

  test("recordPublication refuses without recording when the copy is being uninstalled", async () => {
    assertResourceEditable.mockRejectedValueOnce(new Error("uninstalling"))

    await expect(
      miniAppService.recordPublication(scope, publication),
    ).rejects.toThrow("uninstalling")
    expect(record).not.toHaveBeenCalled()
  })
})
