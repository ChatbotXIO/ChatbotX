import { beforeEach, describe, expect, test, vi } from "vitest"

const findBy = vi.fn()
const findFirst = vi.fn()
const identify = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  conversationService: { findBy },
}))
vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { importModel: { findFirst } } },
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

  test("fails open when no workspace identity is available", async () => {
    await expect(
      resolveWorkspaceId({ type: "embedding" }),
    ).resolves.toBeUndefined()
  })
})
