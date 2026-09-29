import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockAdoptPhoneNumberIfSafeInTransaction,
  mockFinalizePhoneNumberAdoption,
  mockInvalidateTracking,
  mockSyncScopedIdentity,
  mockTransaction,
} = vi.hoisted(() => ({
  mockAdoptPhoneNumberIfSafeInTransaction: vi.fn(),
  mockFinalizePhoneNumberAdoption: vi.fn().mockResolvedValue(undefined),
  mockInvalidateTracking: vi.fn().mockResolvedValue(undefined),
  mockSyncScopedIdentity: vi.fn(),
  mockTransaction: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mockTransaction },
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: {
    invalidateTracking: mockInvalidateTracking,
    syncScopedIdentity: mockSyncScopedIdentity,
  },
}))

vi.mock("../src/contact/service", () => ({
  contactService: {
    adoptPhoneNumberIfSafeInTransaction:
      mockAdoptPhoneNumberIfSafeInTransaction,
    finalizePhoneNumberAdoption: mockFinalizePhoneNumberAdoption,
  },
}))

const { syncExistingContactIdentity } = await import(
  "../src/contact-inbox/sync-existing-identity"
)

const contact = {
  id: "contact-1",
  workspaceId: "workspace-1",
  phoneNumber: "+84900000001",
}

const contactInbox = {
  id: "contact-inbox-1",
  contactId: contact.id,
  inboxId: "inbox-1",
  sourceId: "84900000001",
  sourceUserId: "user-id-old",
  sourceParentUserId: "parent-user-id",
}

const incomingContact = {
  sourceId: "84900000002",
  sourceUserId: "user-id-new",
  sourceParentUserId: "parent-user-id",
}

const input = {
  workspaceId: contact.workspaceId,
  contact: contact as never,
  contactInbox: contactInbox as never,
  incomingContact,
  matchedBy: "sourceParentUserId" as const,
}

describe("syncExistingContactIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("rolls back a D6 identity write when phone adoption fails, then a retry succeeds", async () => {
    let committedSourceUserId = contactInbox.sourceUserId

    mockTransaction.mockImplementation(
      async (run: (tx: { sourceUserId: string }) => Promise<unknown>) => {
        const tx = { sourceUserId: committedSourceUserId }
        const result = await run(tx)
        committedSourceUserId = tx.sourceUserId
        return result
      },
    )
    mockSyncScopedIdentity.mockImplementation(
      ({ tx }: { tx: { sourceUserId: string } }) => {
        tx.sourceUserId = incomingContact.sourceUserId
        return {
          contactInbox: {
            ...contactInbox,
            sourceId: incomingContact.sourceId,
            sourceUserId: incomingContact.sourceUserId,
          },
          invalidation: { cacheTags: ["contact-inbox-tag"] },
          phoneTransition: {
            previousPhone: contactInbox.sourceId,
            newPhone: incomingContact.sourceId,
          },
        }
      },
    )
    const adoptionError = new Error("contact update failed")
    mockAdoptPhoneNumberIfSafeInTransaction
      .mockRejectedValueOnce(adoptionError)
      .mockResolvedValueOnce({
        existing: contact,
        updated: { ...contact, phoneNumber: "+84900000002" },
      })

    await expect(syncExistingContactIdentity(input)).rejects.toBe(adoptionError)
    expect(committedSourceUserId).toBe("user-id-old")

    await expect(syncExistingContactIdentity(input)).resolves.toEqual({
      contactInbox: expect.objectContaining({
        sourceId: "84900000002",
        sourceUserId: "user-id-new",
      }),
      contact: expect.objectContaining({ phoneNumber: "+84900000002" }),
      learnedPrimaryIdentity: undefined,
    })
    expect(committedSourceUserId).toBe("user-id-new")
    expect(mockSyncScopedIdentity).toHaveBeenCalledTimes(2)
    expect(mockInvalidateTracking).toHaveBeenCalledWith({
      cacheTags: ["contact-inbox-tag"],
    })
    expect(mockFinalizePhoneNumberAdoption).toHaveBeenCalledTimes(1)
  })

  test("treats a rejected phone CAS as a successful no-op and rolls back D6", async () => {
    let committedSourceUserId = contactInbox.sourceUserId

    mockTransaction.mockImplementation(
      async (run: (tx: { sourceUserId: string }) => Promise<unknown>) => {
        const tx = { sourceUserId: committedSourceUserId }
        const result = await run(tx)
        committedSourceUserId = tx.sourceUserId
        return result
      },
    )
    mockSyncScopedIdentity.mockImplementation(
      ({ tx }: { tx: { sourceUserId: string } }) => {
        tx.sourceUserId = incomingContact.sourceUserId
        return {
          contactInbox: {
            ...contactInbox,
            sourceId: incomingContact.sourceId,
            sourceUserId: incomingContact.sourceUserId,
          },
          invalidation: { cacheTags: ["contact-inbox-tag"] },
          phoneTransition: {
            previousPhone: contactInbox.sourceId,
            newPhone: incomingContact.sourceId,
          },
        }
      },
    )
    mockAdoptPhoneNumberIfSafeInTransaction.mockResolvedValue(undefined)

    await expect(syncExistingContactIdentity(input)).resolves.toEqual({
      contactInbox,
      contact,
      learnedPrimaryIdentity: undefined,
    })
    expect(committedSourceUserId).toBe("user-id-old")
    expect(mockInvalidateTracking).not.toHaveBeenCalled()
    expect(mockFinalizePhoneNumberAdoption).not.toHaveBeenCalled()
  })
})
