import { systemFieldTypes } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ContactModel,
  ConversationModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"

// Every helper is stubbed: this suite is about the resolver's own switch, not
// about what the helpers return. `system-fields.test.ts` covers the helpers.
const { mockLoggerError, testEncryptionKey } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
  testEncryptionKey:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
}))

vi.mock("../src/logger", () => ({
  logger: {
    debug: vi.fn(),
    error: mockLoggerError,
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  appointmentService: {
    findBy: vi.fn().mockResolvedValue({
      id: "appointment-1",
      contactId: "contact-1",
      startAt: new Date("2026-01-04T03:04:05.000Z"),
      inviteeTimezone: "UTC",
      calendar: { name: "Discovery" },
    }),
  },
  conversationService: {
    findDMByContact: vi.fn().mockResolvedValue({
      lastStep: "step-1",
      currentStep: "step-2",
    }),
  },
  messageService: {
    findById: vi.fn().mockResolvedValue({
      id: "message-1",
      sourceId: "comment-1",
      text: "Nice post",
      deletedAt: null,
      contentAttributes: { postId: "post-1" },
    }),
  },
}))

vi.mock("@chatbotx.io/business/system-field", () => ({
  resolveGenderLabel: vi.fn().mockReturnValue("Anh"),
}))

vi.mock("@chatbotx.io/encryption/keys", () => ({
  env: { ENCRYPTION_KEY: testEncryptionKey },
}))

vi.mock("../src/helpers/assigned", () => ({
  getAssignedTeamName: vi.fn().mockResolvedValue("Team"),
  resolveAssigneeEmail: vi.fn().mockResolvedValue("admin@example.com"),
  resolveAssigneeId: vi.fn().mockResolvedValue("admin-1"),
  resolveAssigneeName: vi.fn().mockResolvedValue("Admin"),
}))

vi.mock("../src/helpers/contact", () => ({
  listContactTagsString: vi.fn().mockResolvedValue("vip"),
  findPrimaryContactChannel: vi.fn().mockResolvedValue("messenger"),
  listContactNotesString: vi.fn().mockResolvedValue("note"),
  getLatestContactNoteString: vi.fn().mockResolvedValue("note"),
}))

vi.mock("../src/helpers/message", () => ({
  getChatHistory: vi.fn().mockResolvedValue("history"),
}))

vi.mock("../src/helpers/queued-messages", () => ({
  getQueuedMessages: vi.fn().mockResolvedValue("queued messages"),
}))

vi.mock("../src/helpers/last-input", () => ({
  getContactLastInput: vi.fn().mockResolvedValue("hello"),
  getContactLastInputType: vi.fn().mockResolvedValue("text"),
}))

vi.mock("../src/helpers/integration-fields", () => ({
  getIntegrationField: vi.fn().mockResolvedValue("integration-value"),
  getLastCommentedPostText: vi.fn().mockResolvedValue("post text"),
}))

vi.mock("../src/helpers/storage-url", () => ({
  toPublicStorageUrl: vi.fn().mockResolvedValue("https://cdn.example/a.png"),
}))

const { getSystemFieldValue } = await import("../src/utils")

const contact = {
  id: "contact-1",
  workspaceId: "workspace-1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phoneNumber: "+84900000000",
  avatar: "avatars/a.png",
  gender: "male",
  locale: "vi_VN",
  timezone: "7",
  country: "VN",
  state: "HCM",
  city: "Thu Duc",
  ref: "launch",
  location: { latitude: 10.75, longitude: 106.66 },
} as ContactModel

const contactInbox = {
  id: "contact-inbox-1",
  inboxId: "inbox-1",
  sourceId: "source-1",
  channel: "messenger",
  source: "ads",
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
  contactLastReadAt: new Date("2026-01-02T03:04:05.000Z"),
  lastIncomingMessageAt: new Date("2026-01-02T03:04:05.000Z"),
  lastOutboundMessageAt: new Date("2026-01-02T03:04:05.000Z"),
  lastBtnTitle: "Choose plan",
  lastInputFailure: "Invalid email",
  lastErrorLog: "(#551) unavailable",
  webchatParentUrl: "https://shop.example",
  consecutiveFailedReply: 2,
  lastCommentMessageId: "message-1",
  lastCommentMessageAt: new Date("2026-01-03T03:04:05.000Z"),
  referral: {
    ref: "launch",
    adId: "ad-123",
    adTitle: "Launch ad",
    ctwaClid: "ctwa-1",
    sourceUrl: "https://example.com/ad",
    sourcePlatform: "facebook",
  },
} as ContactInboxModel

const workspace = {
  id: "workspace-1",
  name: "Workspace One",
  logo: "logos/w.png",
  timezone: "UTC",
  token: "workspace-token",
  language: "vi",
} as WorkspaceModel

const conversation = {
  id: "conversation-1",
  contactId: "contact-1",
  workspaceId: "workspace-1",
} as ConversationModel

const fullContext = {
  contact,
  contactInbox,
  conversation,
  appointmentId: "appointment-1",
  workspace,
}
const emptyContext = {
  contact,
  contactInbox: null,
  conversation: null,
  appointmentId: undefined,
  workspace: null,
}

// Fields the resolver intentionally has no data source for yet.
const ALWAYS_NULL: readonly string[] = [
  systemFieldTypes.enum.last_order,
  systemFieldTypes.enum.total_new_tagged,
  systemFieldTypes.enum.total_tagged,
]

describe("getSystemFieldValue exhaustiveness", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("every system field resolves to a string or null", async () => {
    for (const key of systemFieldTypes.options) {
      const value = await getSystemFieldValue(fullContext, key)
      expect(
        typeof value === "string" || value === null,
        `${key} resolved to ${String(value)}`,
      ).toBe(true)
    }
  })

  test("no system field falls through to the unhandled branch", async () => {
    for (const key of systemFieldTypes.options) {
      await getSystemFieldValue(fullContext, key)
    }

    expect(mockLoggerError).not.toHaveBeenCalled()
  })

  test("every system field survives an empty context without throwing", async () => {
    for (const key of systemFieldTypes.options) {
      await expect(
        getSystemFieldValue(emptyContext, key),
        `${key} threw on an empty context`,
      ).resolves.not.toThrow()
    }

    expect(mockLoggerError).not.toHaveBeenCalled()
  })

  test("only the known-unimplemented fields are null for a fully populated contact", async () => {
    const nullFields: string[] = []
    for (const key of systemFieldTypes.options) {
      const value = await getSystemFieldValue(fullContext, key)
      if (value === null) {
        nullFields.push(key)
      }
    }

    expect(nullFields.sort()).toEqual([...ALWAYS_NULL].sort())
  })
})
