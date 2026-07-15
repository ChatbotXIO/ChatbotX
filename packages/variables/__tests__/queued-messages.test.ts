import type {
  ContactInboxModel,
  ContactModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ContactVariableContext } from "../src/schema"

const { mockListIncomingTextsByContactInbox } = vi.hoisted(() => ({
  mockListIncomingTextsByContactInbox: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  messageService: {
    listIncomingTextsByContactInbox: mockListIncomingTextsByContactInbox,
  },
}))

const { getQueuedMessages } = await import("../src/helpers/queued-messages")

const contact = {
  id: "contact-1",
  workspaceId: "workspace-1",
} as ContactModel

const workspace = {
  id: "workspace-1",
} as WorkspaceModel

const createContext = (
  contactInbox: ContactInboxModel | null,
): ContactVariableContext => ({
  contact,
  contactInbox,
  conversation: null,
  workspace,
})

const createContactInbox = (
  overrides: Partial<ContactInboxModel> = {},
): ContactInboxModel =>
  ({
    id: "contact-inbox-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    firstInteractionAt: null,
    lastOutboundMessageAt: null,
    ...overrides,
  }) as ContactInboxModel

describe("getQueuedMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("uses last outbound message time before older fallback anchors", async () => {
    const sinceTime = new Date("2026-01-03T00:00:00.000Z")
    mockListIncomingTextsByContactInbox.mockResolvedValue(["new", "old"])

    await expect(
      getQueuedMessages(
        createContext(
          createContactInbox({
            firstInteractionAt: new Date("2026-01-02T00:00:00.000Z"),
            lastOutboundMessageAt: sinceTime,
          }),
        ),
      ),
    ).resolves.toBe("old\nnew")

    expect(mockListIncomingTextsByContactInbox).toHaveBeenCalledWith({
      contactInboxId: "contact-inbox-1",
      limit: 50,
      sinceTime,
      workspaceId: "workspace-1",
    })
  })

  test("falls back from first interaction time to contact inbox creation time", async () => {
    const firstInteractionAt = new Date("2026-01-02T00:00:00.000Z")
    const createdAt = new Date("2026-01-01T00:00:00.000Z")
    mockListIncomingTextsByContactInbox.mockResolvedValue(["hello"])

    await getQueuedMessages(
      createContext(
        createContactInbox({
          createdAt,
          firstInteractionAt,
        }),
      ),
    )
    expect(mockListIncomingTextsByContactInbox).toHaveBeenLastCalledWith(
      expect.objectContaining({ sinceTime: firstInteractionAt }),
    )

    await getQueuedMessages(createContext(createContactInbox({ createdAt })))
    expect(mockListIncomingTextsByContactInbox).toHaveBeenLastCalledWith(
      expect.objectContaining({ sinceTime: createdAt }),
    )
  })

  test("returns null for empty results", async () => {
    mockListIncomingTextsByContactInbox.mockResolvedValue([])

    await expect(
      getQueuedMessages(createContext(createContactInbox())),
    ).resolves.toBeNull()
  })

  test("returns null without querying when contact inbox is unavailable", async () => {
    await expect(getQueuedMessages(createContext(null))).resolves.toBeNull()

    expect(mockListIncomingTextsByContactInbox).not.toHaveBeenCalled()
  })
})
