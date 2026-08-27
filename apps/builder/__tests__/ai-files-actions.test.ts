import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auditRecord: vi.fn(),
  deleteObject: vi.fn(),
  findFirstGemini: vi.fn(),
  findFirstOpenai: vi.fn(),
  findOrFail: vi.fn(),
  insertReturning: vi.fn(),
  loggerWarn: vi.fn(),
  queueAdd: vi.fn(),
  txDeleteWhere: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@/features/common/schemas", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: mocks.loggerWarn },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mocks.auditRecord },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { deleteObject: mocks.deleteObject },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "file-1",
  zodBigintAsString: () => "mocked-schema",
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  AIJobAction: { processAIFile: "processAIFile" },
  aiAgentQueue: { add: mocks.queueAdd },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock("../src/features/ai-files/schemas", () => ({
  createAIFileRequest: {},
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  aiEmbeddingModel: { id: "id" },
  aiFileModel: { id: "id" },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    delete: vi.fn(() => ({ where: mocks.txDeleteWhere })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: mocks.insertReturning })),
    })),
    query: {
      integrationGeminiModel: { findFirst: mocks.findFirstGemini },
      integrationOpenaiModel: { findFirst: mocks.findFirstOpenai },
    },
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ delete: vi.fn(() => ({ where: mocks.txDeleteWhere })) }),
    ),
  },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  findOrFail: mocks.findOrFail,
}))

const { createAIFileAction } = await import(
  "@/features/ai-files/actions/create-ai-file.action"
)
const { deleteAIFile } = await import(
  "@/features/ai-files/actions/delete-ai-file.action"
)

type ActionHandler<TParsedInput, TBindArgs extends unknown[]> = (props: {
  parsedInput: TParsedInput
  bindArgsParsedInputs: TBindArgs
}) => Promise<unknown>

const workspaceId = "workspace-1"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findFirstOpenai.mockResolvedValue({ id: "openai-1" })
  mocks.findFirstGemini.mockResolvedValue(undefined)
  mocks.insertReturning.mockResolvedValue([{ id: "file-1" }])
  mocks.findOrFail.mockResolvedValue({ id: "file-1", path: "path/to/file" })
})

describe("Knowledge tab audit messages", () => {
  test("createAIFileAction logs created a new Knowledge by id", async () => {
    await (
      createAIFileAction as unknown as ActionHandler<{ name: string }, [string]>
    )({
      parsedInput: { name: "manual.pdf" },
      bindArgsParsedInputs: [workspaceId],
    })

    expect(mocks.auditRecord).toHaveBeenCalledWith({
      workspaceId,
      action: "create",
      detail: "created a new Knowledge (#file-1)",
    })
  })

  test("deleteAIFile logs deleted a Knowledge by id", async () => {
    await deleteAIFile({ workspaceId, id: "file-1" })

    expect(mocks.auditRecord).toHaveBeenCalledWith({
      workspaceId,
      action: "delete",
      detail: "deleted a Knowledge (#file-1)",
    })
  })

  test("does not log the legacy AI Agent knowledge base message", async () => {
    await (
      createAIFileAction as unknown as ActionHandler<{ name: string }, [string]>
    )({
      parsedInput: { name: "manual.pdf" },
      bindArgsParsedInputs: [workspaceId],
    })
    await deleteAIFile({ workspaceId, id: "file-1" })

    for (const call of mocks.auditRecord.mock.calls) {
      expect(call[0].detail).not.toContain(
        "updated the AI Agent knowledge base",
      )
    }
  })
})
