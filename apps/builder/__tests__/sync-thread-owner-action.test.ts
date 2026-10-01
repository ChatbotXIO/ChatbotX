// @vitest-environment node
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByOrFail: vi.fn(),
  findByUncached: vi.fn(),
  syncThreadOwner: vi.fn(),
  requireContactAccessForMember: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: { findByOrFail: mocks.findByOrFail },
  contactInboxService: { findByUncached: mocks.findByUncached },
}))

vi.mock("@chatbotx.io/channel-registry/thread-control", () => ({
  syncThreadOwner: mocks.syncThreadOwner,
}))

vi.mock("@/features/contacts/permissions", () => ({
  requireContactAccessForMember: mocks.requireContactAccessForMember,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

const { syncThreadOwnerAction: untypedAction } = await import(
  "../src/features/conversations/actions/sync-thread-owner.action"
)
const syncThreadOwnerAction = untypedAction as unknown as (props: {
  bindArgsParsedInputs: [string]
  parsedInput: { contactInboxId: string; conversationId: string }
  ctx: { user: { id: string }; workspaceMemberPermissions: unknown }
}) => Promise<unknown>

const permissions = { onlyAssignedContacts: true }
const contactInbox = { id: "ci-1", contactId: "contact-1" }
const run = (contactInboxId = "ci-1") =>
  syncThreadOwnerAction({
    bindArgsParsedInputs: ["ws-1"],
    parsedInput: { contactInboxId, conversationId: "conv-1" },
    ctx: { user: { id: "user-1" }, workspaceMemberPermissions: permissions },
  })

const snapshot = {
  contactInboxId: "ci-1",
  threadControlState: "standby",
  threadOwnerRole: "ai_agent",
  threadControlUpdatedAt: new Date("2026-09-29T10:00:00.000Z"),
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findByOrFail.mockResolvedValue({ id: "conv-1", contactId: "contact-1" })
  mocks.findByUncached.mockResolvedValue(contactInbox)
  mocks.requireContactAccessForMember.mockResolvedValue({})
  mocks.syncThreadOwner.mockResolvedValue(snapshot)
})

describe("syncThreadOwnerAction", () => {
  test("checks the caller's contact scope, then syncs through the channel registry and returns the snapshot", async () => {
    await expect(run()).resolves.toEqual({ status: "synced", snapshot })

    expect(mocks.findByOrFail).toHaveBeenCalledWith({
      where: { id: "conv-1", workspaceId: "ws-1" },
    })
    expect(mocks.requireContactAccessForMember).toHaveBeenCalledWith({
      permissions,
      userId: "user-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
    })
    expect(mocks.findByUncached).toHaveBeenCalledWith({
      where: { id: "ci-1", contactId: "contact-1" },
    })
    expect(mocks.syncThreadOwner).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInbox,
      conversationId: "conv-1",
    })
  })

  test("returns the unchanged snapshot for a channel without an owner query", async () => {
    // The channel-registry wrapper resolves to the current snapshot when the
    // channel has no getThreadOwner handler (WhatsApp); the action passes it on.
    const unchanged = { ...snapshot, threadControlState: "owned" }
    mocks.syncThreadOwner.mockResolvedValue(unchanged)

    await expect(run()).resolves.toEqual({
      status: "synced",
      snapshot: unchanged,
    })
  })

  test("refuses a caller outside the contact's scope without touching the channel", async () => {
    mocks.requireContactAccessForMember.mockRejectedValue(
      new ChatbotXException("Contact not found", "notFound", 404),
    )

    await expect(run()).rejects.toThrow("Contact not found")
    expect(mocks.syncThreadOwner).not.toHaveBeenCalled()
  })

  test("refuses a contact inbox that does not belong to the conversation's contact", async () => {
    mocks.findByUncached.mockResolvedValue(undefined)

    await expect(run("ci-foreign")).rejects.toThrow(
      "conversationRouting.errors.notFound",
    )
    expect(mocks.syncThreadOwner).not.toHaveBeenCalled()
  })

  test("lets a channel failure propagate instead of reporting a sync", async () => {
    mocks.syncThreadOwner.mockRejectedValue(new Error("graph api down"))

    await expect(run()).rejects.toThrow("graph api down")
  })
})
