import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  clearCustomFields: vi.fn(),
  contactFindById: vi.fn(),
  contactInboxFindByUncached: vi.fn(),
  contactUpdate: vi.fn(),
  db: {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  },
  deleteObject: vi.fn(),
  detachTags: vi.fn(),
  hardDeleteAllByContactInbox: vi.fn(),
  listIncomingTextsByContactInbox: vi.fn(),
  resolveTenantSettings: vi.fn(),
  verifyMeLink: vi.fn(),
  workspaceFindById: vi.fn(),
  conversationFindByUncached: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: mocks.db,
  eq: vi.fn(),
}))

vi.mock("@chatbotx.io/encryption/link-signature", () => ({
  verifyMeLink: mocks.verifyMeLink,
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { deleteObject: mocks.deleteObject },
}))

vi.mock("../src/contact/service", () => ({
  contactService: {
    findById: mocks.contactFindById,
    update: mocks.contactUpdate,
  },
}))

vi.mock("../src/contact-custom-field/service", () => ({
  contactCustomFieldService: {
    clearByContactId: mocks.clearCustomFields,
    listWithDefinitions: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { findByUncached: mocks.contactInboxFindByUncached },
  getContactInboxSinceTime: (contactInbox: {
    firstInteractionAt: Date | null
    createdAt: Date
  }) => contactInbox.firstInteractionAt ?? contactInbox.createdAt,
}))

vi.mock("../src/conversation/service", () => ({
  conversationService: { findByUncached: mocks.conversationFindByUncached },
}))

vi.mock("../src/message/service", () => ({
  messageService: {
    hardDeleteAllByContactInbox: mocks.hardDeleteAllByContactInbox,
    listIncomingTextsByContactInbox: mocks.listIncomingTextsByContactInbox,
  },
}))

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: mocks.resolveTenantSettings,
}))

vi.mock("../src/tag/service", () => ({
  tagService: {
    detachAllFromContact: mocks.detachTags,
    listByContactId: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: { findById: mocks.workspaceFindById },
}))

const { resolveGenderLabel, systemFieldService } = await import(
  "../src/system-field/service"
)

const payload = {
  channel: "messenger",
  contactId: "contact-1",
  contactInboxId: "contact-inbox-1",
  conversationId: "conversation-1",
  integrationId: "inbox-1",
  sourceId: "source-1",
  workspaceId: "workspace-1",
} as const

const params = {
  formId: "system-field-1",
  hash: "valid-hash",
  integrationId: payload.integrationId,
  sourceId: payload.sourceId,
  workspaceId: payload.workspaceId,
}

const row = {
  id: params.formId,
  type: "me",
  payload,
}

const contact = {
  avatar: null,
  email: null,
  firstName: "A",
  fullName: "A User",
  gender: null,
  id: payload.contactId,
  lastName: "User",
  locale: null,
  phoneNumber: null,
  timezone: null,
}

const firstInteractionAt = new Date("2026-05-11T04:02:22.000Z")
const contactInbox = {
  channel: payload.channel,
  contactId: payload.contactId,
  createdAt: new Date("2026-06-05T07:34:29.000Z"),
  firstInteractionAt,
  id: payload.contactInboxId,
  sourceId: payload.sourceId,
}

const conversation = {
  createdAt: new Date("2026-06-05T07:34:29.000Z"),
  id: payload.conversationId,
}

describe("resolveGenderLabel", () => {
  test("uses the Vietnamese labels for a Vietnamese workspace", () => {
    expect(resolveGenderLabel("vi", "male")).toBe("Anh")
    expect(resolveGenderLabel("vi", "female")).toBe("Chị")
    expect(resolveGenderLabel("vi", "unknown")).toBe("Anh/Chị")
  })

  test("falls back to the English labels for every other language", () => {
    expect(resolveGenderLabel("en", "male")).toBe("Male")
    expect(resolveGenderLabel("de", "female")).toBe("Female")
    expect(resolveGenderLabel(null, "male")).toBe("Male")
    expect(resolveGenderLabel(undefined, null)).toBe("Male/Female")
  })

  test("matches on the primary subtag so region-tagged languages still localise", () => {
    expect(resolveGenderLabel("vi-VN", "male")).toBe("Anh")
    expect(resolveGenderLabel("VI", "female")).toBe("Chị")
    expect(resolveGenderLabel("vi_VN", null)).toBe("Anh/Chị")
  })

  test("treats an unrecognised gender as unknown", () => {
    expect(resolveGenderLabel("vi", "nonbinary")).toBe("Anh/Chị")
    expect(resolveGenderLabel("vi", "")).toBe("Anh/Chị")
  })
})

describe("systemFieldService privacy message window", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyMeLink.mockReturnValue(true)
    mocks.contactFindById.mockResolvedValue(contact)
    mocks.contactInboxFindByUncached.mockResolvedValue(contactInbox)
    mocks.conversationFindByUncached.mockResolvedValue(conversation)
    mocks.resolveTenantSettings.mockResolvedValue({
      storageUrl: "https://files.example.com/",
    })
    mocks.workspaceFindById.mockResolvedValue({ language: "en" })
    mocks.listIncomingTextsByContactInbox.mockResolvedValue(["old", "new"])
    mocks.hardDeleteAllByContactInbox.mockResolvedValue({
      attachmentPaths: ["messages/a.jpg"],
    })
    vi.spyOn(systemFieldService, "findById").mockResolvedValue(row as never)
    vi.spyOn(systemFieldService, "deleteById").mockResolvedValue(undefined)
  })

  test("buildMeExport reads all contact inbox messages even when the link has a conversation", async () => {
    const result = await systemFieldService.buildMeExport(params)

    expect(result?.messages).toEqual(["old", "new"])
    expect(mocks.listIncomingTextsByContactInbox).toHaveBeenCalledWith({
      contactInboxId: payload.contactInboxId,
      sinceTime: firstInteractionAt,
      workspaceId: payload.workspaceId,
    })
  })

  test("buildMeExport rejects malformed stored payloads before loading contact data", async () => {
    vi.spyOn(systemFieldService, "findById").mockResolvedValue({
      ...row,
      payload: { ...payload, contactId: undefined },
    } as never)

    const result = await systemFieldService.buildMeExport(params)

    expect(result).toBeNull()
    expect(mocks.contactFindById).not.toHaveBeenCalled()
    expect(mocks.contactInboxFindByUncached).not.toHaveBeenCalled()
  })

  test("buildMeExport uses firstInteractionAt when no conversation is available", async () => {
    const earlierCreatedAt = new Date("2026-05-01T00:00:00.000Z")
    vi.spyOn(systemFieldService, "findById").mockResolvedValue({
      ...row,
      payload: { ...payload, conversationId: undefined },
    } as never)
    mocks.contactInboxFindByUncached.mockResolvedValue({
      ...contactInbox,
      createdAt: earlierCreatedAt,
      firstInteractionAt: new Date("2026-05-11T04:02:22.000Z"),
    })

    await systemFieldService.buildMeExport(params)

    expect(mocks.listIncomingTextsByContactInbox).toHaveBeenCalledWith({
      contactInboxId: payload.contactInboxId,
      sinceTime: new Date("2026-05-11T04:02:22.000Z"),
      workspaceId: payload.workspaceId,
    })
  })

  test("buildMeExport falls back to contact inbox createdAt when firstInteractionAt is missing", async () => {
    vi.spyOn(systemFieldService, "findById").mockResolvedValue({
      ...row,
      payload: { ...payload, conversationId: undefined },
    } as never)
    mocks.contactInboxFindByUncached.mockResolvedValue({
      ...contactInbox,
      firstInteractionAt: null,
    })

    await systemFieldService.buildMeExport(params)

    expect(mocks.listIncomingTextsByContactInbox).toHaveBeenCalledWith({
      contactInboxId: payload.contactInboxId,
      sinceTime: contactInbox.createdAt,
      workspaceId: payload.workspaceId,
    })
  })

  test("deleteMeData deletes all contact inbox messages and attachments from firstInteractionAt", async () => {
    await systemFieldService.deleteMeData(params)

    expect(mocks.hardDeleteAllByContactInbox).toHaveBeenCalledWith({
      contactInboxId: payload.contactInboxId,
      sinceTime: firstInteractionAt,
      workspaceId: payload.workspaceId,
    })
    expect(mocks.deleteObject).toHaveBeenCalledWith("messages/a.jpg")
  })
})
