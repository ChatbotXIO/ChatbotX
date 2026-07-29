import { beforeEach, describe, expect, test, vi } from "vitest"

const findBy = vi.fn()
const findFirst = vi.fn()
const identify = vi.fn()
const smartDelayFindById = vi.fn()
const findWorkspaceId = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  conversationService: { findBy },
}))
vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { importModel: { findFirst } } },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  createAiWorkspaceScopeRepository: () => ({ findWorkspaceId }),
}))
vi.mock("@chatbotx.io/business/smart-delay", () => ({
  smartDelayService: { findById: smartDelayFindById },
}))
vi.mock("../src/services/integrations", () => ({
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: identify,
  },
}))

const { resolveWorkspaceId } = await import("../src/lib/resolve-workspace-id")

beforeEach(() => {
  findBy.mockReset()
  findFirst.mockReset()
  identify.mockReset()
  smartDelayFindById.mockReset()
  findWorkspaceId.mockReset()
})

describe("resolveWorkspaceId", () => {
  test.each([
    [{ workspaceId: "workspace-direct" }, "workspace-direct"],
    [
      { conversation: { workspaceId: "workspace-conversation" } },
      "workspace-conversation",
    ],
    [
      { conversationId: { workspaceId: "workspace-object" } },
      "workspace-object",
    ],
  ])("resolves direct workspace identities", async (data, expected) => {
    await expect(resolveWorkspaceId(data)).resolves.toBe(expected)
    expect(findBy).not.toHaveBeenCalled()
  })

  test("resolves a conversation id", async () => {
    findBy.mockResolvedValue({ workspaceId: "workspace-from-conversation" })
    await expect(
      resolveWorkspaceId({ conversationId: "conversation-1" }),
    ).resolves.toBe("workspace-from-conversation")
  })

  test("resolves an integration identifier", async () => {
    identify.mockResolvedValue({
      inbox: { workspaceId: "workspace-from-integration" },
    })
    await expect(
      resolveWorkspaceId({
        integrationType: "messenger",
        integrationIdentifier: "page-1",
      }),
    ).resolves.toBe("workspace-from-integration")
  })

  test("resolves an import id", async () => {
    findFirst.mockResolvedValue({ workspaceId: "workspace-from-import" })
    await expect(resolveWorkspaceId({ importId: "import-1" })).resolves.toBe(
      "workspace-from-import",
    )
  })

  test("resolves a smart delay id", async () => {
    smartDelayFindById.mockResolvedValue({
      workspaceId: "workspace-from-smart-delay",
    })

    await expect(
      resolveWorkspaceId({ smartDelayId: "smart-delay-1" }),
    ).resolves.toBe("workspace-from-smart-delay")
  })

  // The scope assertion is the point: one shared repository method means a
  // mis-wired row in the resolver table would still return a workspace id and
  // silently attribute an AI job to the wrong record kind.
  test.each([
    { field: "aiFileId", id: "ai-file-1", scope: "aiFile" },
    { field: "aiEmbeddingId", id: "ai-embedding-1", scope: "aiEmbedding" },
    { field: "sourceId", id: "source-1", scope: "conversationSource" },
    {
      field: "conversationEmbeddingId",
      id: "embedding-1",
      scope: "conversationEmbedding",
    },
  ])("resolves $field through the $scope scope", async ({
    field,
    id,
    scope,
  }) => {
    findWorkspaceId.mockResolvedValue("workspace-from-ai-record")

    await expect(resolveWorkspaceId({ [field]: id })).resolves.toBe(
      "workspace-from-ai-record",
    )
    expect(findWorkspaceId).toHaveBeenCalledWith({ id, scope })
  })

  test("prefers the earlier resolver when a payload carries several ids", async () => {
    findBy.mockResolvedValue({ workspaceId: "workspace-from-conversation" })

    await expect(
      resolveWorkspaceId({ aiFileId: "ai-file-1", conversationId: "conv-1" }),
    ).resolves.toBe("workspace-from-conversation")
    expect(findWorkspaceId).not.toHaveBeenCalled()
  })

  test("fails open when no workspace identity is available", async () => {
    await expect(
      resolveWorkspaceId({ type: "unknown" }),
    ).resolves.toBeUndefined()
  })
})
