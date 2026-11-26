// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  allows: vi.fn(),
  findBy: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContactPermissionScope: vi.fn(),
  contactService: {},
  conversationMemberScope: { resolve: mocks.resolve, allows: mocks.allows },
  conversationService: { findBy: mocks.findBy },
  flowService: {},
  UNSCOPED: Symbol("unscoped"),
}))

const {
  conversationAccessCheckForCaller,
  lazyConversationAccessCheckForCaller,
} = await import("@/lib/public-api/member-scope")

const workspace = { id: "ws-1" }
const user = { id: "user-1" }
const member = {
  userId: "user-1",
  permissions: {
    superAdmin: false,
    analytics: false,
    flows: false,
    contacts: false,
    onlyAssignedContacts: true,
    emailAndPhone: false,
    broadcast: false,
    ecommerce: false,
  },
}
const assignedScope = { chatScope: "assigned", teamIds: [], userId: "user-1" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolve.mockResolvedValue(assignedScope)
  mocks.findBy.mockImplementation(
    async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      assignedUserId: where.id === "c-mine" ? "user-1" : "user-2",
      assignedInboxTeamId: null,
    }),
  )
  mocks.allows.mockImplementation(
    (_scope: unknown, conversation: { assignedUserId: string }) =>
      conversation.assignedUserId === "user-1",
  )
})

describe("conversationAccessCheckForCaller", () => {
  test("a workspace-token caller is unscoped: no check, no lookup", async () => {
    await expect(
      conversationAccessCheckForCaller({ workspace }),
    ).resolves.toBeUndefined()
    expect(mocks.resolve).not.toHaveBeenCalled()
  })

  test("a member who sees every conversation is unscoped", async () => {
    mocks.resolve.mockResolvedValue({
      chatScope: "all",
      teamIds: [],
      userId: "user-1",
    })

    await expect(
      conversationAccessCheckForCaller({ workspace, member, user }),
    ).resolves.toBeUndefined()
  })

  test("a member limited to assigned conversations sees only those, each looked up once", async () => {
    const check = await conversationAccessCheckForCaller({
      workspace,
      member,
      user,
    })
    if (!check) {
      throw new Error("expected a scoped check")
    }

    await expect(check("c-mine")).resolves.toBe(true)
    await expect(check("c-other")).resolves.toBe(false)
    await expect(check("c-mine")).resolves.toBe(true)

    expect(mocks.findBy).toHaveBeenCalledTimes(2)
    expect(mocks.findBy).toHaveBeenCalledWith({
      where: { id: "c-mine", workspaceId: "ws-1" },
    })
  })

  test("a missing conversation, or a failed lookup, counts as outside the scope", async () => {
    mocks.findBy.mockResolvedValueOnce(undefined)
    mocks.findBy.mockRejectedValueOnce(new Error("connection reset"))
    const check = await conversationAccessCheckForCaller({
      workspace,
      member,
      user,
    })
    if (!check) {
      throw new Error("expected a scoped check")
    }

    await expect(check("c-gone")).resolves.toBe(false)
    await expect(check("c-error")).resolves.toBe(false)
  })
})

describe("lazyConversationAccessCheckForCaller", () => {
  test("resolves no member scope until a conversation is asked about", () => {
    lazyConversationAccessCheckForCaller({ workspace, member, user })

    expect(mocks.resolve).not.toHaveBeenCalled()
  })

  test("then applies the scope, resolving it once", async () => {
    const check = lazyConversationAccessCheckForCaller({
      workspace,
      member,
      user,
    })

    await expect(check("c-mine")).resolves.toBe(true)
    await expect(check("c-other")).resolves.toBe(false)
    expect(mocks.resolve).toHaveBeenCalledTimes(1)
  })

  test("an unscoped caller sees every conversation", async () => {
    const check = lazyConversationAccessCheckForCaller({ workspace })

    await expect(check("c-other")).resolves.toBe(true)
    expect(mocks.findBy).not.toHaveBeenCalled()
  })
})
