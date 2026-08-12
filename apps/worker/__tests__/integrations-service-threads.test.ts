import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockBuildContext,
  mockWorkspaceFindById,
  mockInboxFind,
  mockFindByThreadsUserId,
  mockFindByInboxId,
  mockDbExecute,
} = vi.hoisted(() => ({
  mockBuildContext: vi.fn(),
  mockWorkspaceFindById: vi.fn(),
  mockInboxFind: vi.fn(),
  mockFindByThreadsUserId: vi.fn(),
  mockFindByInboxId: vi.fn(),
  mockDbExecute: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mockBuildContext,
  workspaceService: { findById: mockWorkspaceFindById },
  inboxService: { find: mockInboxFind },
  integrationThreadsService: {
    findByThreadsUserId: mockFindByThreadsUserId,
    findByInboxId: mockFindByInboxId,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { execute: mockDbExecute },
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
    { identifier: (value: string) => value },
  ),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  inboxModel: {},
}))

vi.mock("@chatbotx.io/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/sdk")>()
  return {
    ...actual,
    ChannelErrorCategory: { AUTH_FAILED: "AUTH_FAILED" },
    ChannelError: class ChannelError extends Error {
      category: string
      details: Record<string, unknown>

      constructor(
        message: string,
        category: string,
        details: Record<string, unknown>,
      ) {
        super(message)
        this.name = "ChannelError"
        this.category = category
        this.details = details
      }
    },
    SdkException: class SdkException extends Error {},
  }
})

const { integrationService } = await import("../src/services/integrations")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("integrationService Threads resolution", () => {
  test("resolves a Threads identifier via business services without dynamic SQL", async () => {
    mockFindByThreadsUserId.mockResolvedValue({
      id: "threads-int-1",
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      auth: { accessToken: "token" },
    })
    mockWorkspaceFindById.mockResolvedValue({ id: "ws-1" })
    mockInboxFind.mockResolvedValue({ id: "inbox-1", workspaceId: "ws-1" })

    const result =
      await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
        "threads",
        "threads-user-1",
      )

    expect(mockFindByThreadsUserId).toHaveBeenCalledWith("threads-user-1")
    expect(mockWorkspaceFindById).toHaveBeenCalledWith({ id: "ws-1" })
    expect(mockInboxFind).toHaveBeenCalledWith({ where: { id: "inbox-1" } })
    expect(mockDbExecute).not.toHaveBeenCalled()
    expect(result).toEqual({
      integrationRow: {
        id: "threads-int-1",
        workspaceId: "ws-1",
        inboxId: "inbox-1",
        auth: { accessToken: "token" },
      },
      workspace: { id: "ws-1" },
      inbox: { id: "inbox-1", workspaceId: "ws-1" },
    })
  })

  test("keeps IntegrationNotFoundError semantics when a Threads identifier is missing", async () => {
    mockFindByThreadsUserId.mockResolvedValue(undefined)

    await expect(
      integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
        "threads",
        "threads-user-missing",
      ),
    ).rejects.toMatchObject({
      name: "IntegrationNotFoundError",
      channel: "threads",
      identifier: "threads-user-missing",
    })

    expect(mockDbExecute).not.toHaveBeenCalled()
  })

  test("resolves Threads auth from contact inbox via the Threads service", async () => {
    mockFindByInboxId.mockResolvedValue({
      id: "threads-int-1",
      inboxId: "inbox-1",
      auth: { accessToken: "token" },
    })

    const result = await integrationService.getIntegrationFromContactInbox({
      channel: "threads",
      inboxId: "inbox-1",
    } as never)

    expect(mockFindByInboxId).toHaveBeenCalledWith("inbox-1")
    expect(mockDbExecute).not.toHaveBeenCalled()
    expect(result).toEqual({
      id: "threads-int-1",
      inboxId: "inbox-1",
      auth: { accessToken: "token" },
    })
  })

  test("keeps ChannelError semantics when a Threads inbox has no integration row", async () => {
    mockFindByInboxId.mockResolvedValue(undefined)

    await expect(
      integrationService.getIntegrationFromContactInbox({
        channel: "threads",
        inboxId: "inbox-missing",
      } as never),
    ).rejects.toMatchObject({
      name: "ChannelError",
      message: "Unable to find integration auth for channel: threads",
      category: "AUTH_FAILED",
      details: { code: "integration_auth_missing" },
    })

    expect(mockDbExecute).not.toHaveBeenCalled()
  })
})
