import { describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// chatStore.updateContact — a contact's `ContactInbox` (and its
// `contactInboxes` in the conversation list) can be shared across multiple
// conversations (e.g. a Messenger DM plus every comment-thread conversation
// for the same page). A profile refresh must patch the contact snapshot on
// ALL of the contact's conversations, immutably, leaving conversations for
// other contacts untouched. See
// .superpowers/sdd/2026-08-31-messenger-ctm-profile-backfill/task-3-brief.md
// ---------------------------------------------------------------------------

vi.mock("@/lib/orpc/orpc", () => ({
  client: { conversationsAPI: {} },
}))

vi.mock("ky", () => ({ default: { post: vi.fn() } }))

const { createChatStore } = await import(
  "../src/features/chat/store/chat-store"
)

type TestContact = {
  id: string
  firstName: string | null
  lastName: string | null
  avatar: string | null
}
type TestConversation = {
  id: string
  contactId: string
  contact: TestContact | null
}

const makeConversation = (
  id: string,
  contactId: string,
  contact: TestContact | null,
): TestConversation => ({ id, contactId, contact })

describe("chatStore.updateContact", () => {
  test("patches every conversation belonging to the contact", () => {
    const store = createChatStore()
    const contact: TestContact = {
      id: "contact-1",
      firstName: null,
      lastName: null,
      avatar: null,
    }
    const dm = makeConversation("conv-dm", "contact-1", contact)
    const comment = makeConversation("conv-comment", "contact-1", contact)
    store.setState({ conversations: [dm, comment] as never })

    store.getState().updateContact("contact-1", {
      firstName: "Jane",
      avatar: "avatars/contact-1.png",
    })

    const conversations = store.getState()
      .conversations as never as TestConversation[]
    expect(conversations[0]?.contact).toEqual({
      ...contact,
      firstName: "Jane",
      avatar: "avatars/contact-1.png",
    })
    expect(conversations[1]?.contact).toEqual({
      ...contact,
      firstName: "Jane",
      avatar: "avatars/contact-1.png",
    })
  })

  test("leaves conversations belonging to other contacts untouched", () => {
    const store = createChatStore()
    const contactA: TestContact = {
      id: "contact-a",
      firstName: null,
      lastName: null,
      avatar: null,
    }
    const contactB: TestContact = {
      id: "contact-b",
      firstName: "Existing",
      lastName: null,
      avatar: null,
    }
    const convA = makeConversation("conv-a", "contact-a", contactA)
    const convB = makeConversation("conv-b", "contact-b", contactB)
    store.setState({ conversations: [convA, convB] as never })

    store.getState().updateContact("contact-a", { firstName: "Jane" })

    const conversations = store.getState()
      .conversations as never as TestConversation[]
    expect(conversations[0]?.contact).toEqual({
      ...contactA,
      firstName: "Jane",
    })
    // Untouched: same object reference, not just equal value.
    expect(conversations[1]?.contact).toBe(contactB)
  })

  test("is a no-op when no conversation matches the contactId", () => {
    const store = createChatStore()
    const contact: TestContact = {
      id: "contact-1",
      firstName: null,
      lastName: null,
      avatar: null,
    }
    const conv = makeConversation("conv-1", "contact-1", contact)
    store.setState({ conversations: [conv] as never })
    const before = store.getState().conversations

    store.getState().updateContact("contact-missing", { firstName: "Jane" })

    expect(store.getState().conversations).toBe(before)
  })
})
