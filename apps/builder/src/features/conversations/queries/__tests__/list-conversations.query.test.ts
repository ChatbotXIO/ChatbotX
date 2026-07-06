// @vitest-environment node
import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/business", () => ({
  conversationService: { findManyQuery: vi.fn() },
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: vi.fn(),
}))
vi.mock("@chatbotx.io/database/client", () => ({
  sql: vi.fn(),
}))
vi.mock("@chatbotx.io/database/queries", () => ({
  applyContactFilter: vi.fn(() => ({})),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn(),
}))
vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: vi.fn(),
}))
vi.mock("@/lib/pagination", () => ({
  decodeCursor: vi.fn(),
  encodeCursor: vi.fn(),
}))

const { buildConversationWhere } = await import("../build-conversation-where")

const baseInput = {
  perPage: 20,
  cursor: undefined,
  keyword: "",
  botCategory: "all" as const,
  assignedId: "all",
  tags: [],
}

describe("buildConversationWhere channel filter", () => {
  test("does not restrict by contactInboxes when channel is the omnichannel sentinel", () => {
    const where = buildConversationWhere(
      "1",
      { ...baseInput, channel: "omnichannel" },
      null,
    )

    expect(where.contactInboxes).toBeUndefined()
  })

  test("restricts by contactInboxes when a real channel is selected", () => {
    const where = buildConversationWhere(
      "1",
      { ...baseInput, channel: "messenger" },
      null,
    )

    expect(where.contactInboxes).toEqual({ channel: "messenger" })
  })
})
