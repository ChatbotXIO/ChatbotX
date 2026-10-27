import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  cancelByInboxSource: vi.fn(),
  createNewContactWithMac: vi.fn(),
  emitContactCreated: vi.fn(),
  finalizeContactProfile: vi.fn(),
}))

vi.mock("../src/contact-locale", () => ({
  finalizeContactProfile: mocks.finalizeContactProfile,
}))

vi.mock("../src/message-cleanup/service", () => ({
  messageCleanupService: {
    cancelByInboxSource: mocks.cancelByInboxSource,
  },
}))

vi.mock("../src/quota-enforcement/service", () => ({
  quotaEnforcementService: {
    createNewContactWithMac: mocks.createNewContactWithMac,
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: {},
  contactModel: {},
  conversationModel: {},
}))

vi.mock("@chatbotx.io/events", () => ({
  emitContactCreated: mocks.emitContactCreated,
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: vi.fn(() => "generated-id"),
  }
})

vi.mock("remeda", () => ({
  randomString: vi.fn(() => "random"),
}))

const { createWebchatGuestContact } = await import(
  "../src/contact/create-webchat-guest-contact"
)

type InsertedRow = Record<string, unknown>

const contact = {
  id: "contact-1",
  firstName: "Guest",
  phoneNumber: null,
  email: "guest-1",
}
const contactInbox = {
  id: "contact-inbox-1",
  sourceId: "guest-1",
}
const conversation = {
  id: "conversation-1",
}

const createTransaction = (insertedRows: InsertedRow[]) => {
  const rows = [contact, contactInbox, conversation]
  return {
    insert: vi.fn(() => ({
      values: vi.fn((row: InsertedRow) => {
        insertedRows.push(row)
        return {
          returning: vi.fn(() => Promise.resolve([rows.shift()])),
        }
      }),
    })),
  }
}

describe("createWebchatGuestContact", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cancelByInboxSource.mockResolvedValue(undefined)
    mocks.emitContactCreated.mockResolvedValue(undefined)
    mocks.finalizeContactProfile.mockReturnValue({
      language: "vi",
      locale: "vi_VN",
      timezone: "Asia/Ho_Chi_Minh",
    })
  })

  test("creates the guest contact records inside the MAC gate, cancels cleanup, and emits creation", async () => {
    const insertedRows: InsertedRow[] = []
    const tx = createTransaction(insertedRows)
    mocks.createNewContactWithMac.mockImplementation(async ({ create }) => ({
      ok: true,
      ...(await create(tx)),
    }))

    await expect(
      createWebchatGuestContact({
        ownerId: "owner-1",
        workspaceId: "workspace-1",
        inboxId: "inbox-1",
        sourceId: "guest-1",
        profile: {
          locale: "vi-VN",
          timezone: "Asia/Ho_Chi_Minh",
          webchatParentUrl: "https://example.com/embed",
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { contact, contactInbox, conversation },
    })

    expect(mocks.createNewContactWithMac).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-1",
        workspaceId: "workspace-1",
      }),
    )
    expect(insertedRows).toEqual([
      expect.objectContaining({
        email: "guest-1",
        firstName: "Guest",
        lastName: "random",
        locale: "vi_VN",
        timezone: "Asia/Ho_Chi_Minh",
        workspaceId: "workspace-1",
      }),
      expect.objectContaining({
        channel: "webchat",
        contactId: "contact-1",
        inboxId: "inbox-1",
        language: "vi",
        source: "webchat",
        sourceId: "guest-1",
        webchatParentUrl: "https://example.com/embed",
      }),
      expect.objectContaining({
        contactId: "contact-1",
        workspaceId: "workspace-1",
      }),
    ])
    expect(mocks.cancelByInboxSource).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      sourceIds: ["guest-1"],
      tx,
    })
    expect(mocks.emitContactCreated).toHaveBeenCalledWith(
      "workspace-1",
      "contact-1",
      "Guest",
      undefined,
      "guest-1",
      "contact-inbox-1",
    )
  })

  test("does not emit contact creation when the MAC gate rejects the write", async () => {
    mocks.createNewContactWithMac.mockResolvedValue({
      ok: false,
      level: "user",
    })

    await expect(
      createWebchatGuestContact({
        ownerId: "owner-1",
        workspaceId: "workspace-1",
        inboxId: "inbox-1",
        sourceId: "guest-1",
        profile: {},
      }),
    ).resolves.toEqual({ ok: false, level: "user" })

    expect(mocks.cancelByInboxSource).not.toHaveBeenCalled()
    expect(mocks.emitContactCreated).not.toHaveBeenCalled()
  })
})
