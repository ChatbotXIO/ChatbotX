import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// insertImportedContactBatch — the transaction body moved verbatim from
// imports/handler/contacts/handler.ts's insertContactBatch. Mocks `db` at the
// module boundary (a fake `tx` object passed through db.transaction) plus the
// cross-domain services the transaction calls into.
// ---------------------------------------------------------------------------

const {
  insertContact,
  insertContactInboxValues,
  insertContactInboxReturning,
  deleteContactWhere,
  insertConversationValues,
  insertTagsOnConflictDoNothing,
  cancelByInboxSource,
  insertNormalizedValuesForNewContacts,
  tx,
  CONTACT_MODEL,
  CONTACT_INBOX_MODEL,
  CONVERSATION_MODEL,
  CONTACTS_TO_TAGS_MODEL,
} = vi.hoisted(() => {
  const insertContact = vi.fn()
  const insertContactInboxValues = vi.fn()
  const insertContactInboxReturning = vi.fn()
  const deleteContactWhere = vi.fn()
  const insertConversationValues = vi.fn()
  const insertTagsOnConflictDoNothing = vi.fn()
  const cancelByInboxSource = vi.fn()
  const insertNormalizedValuesForNewContacts = vi.fn()

  const CONTACT_MODEL = { __name: "contactModel" }
  const CONTACT_INBOX_MODEL = {
    __name: "contactInboxModel",
    contactId: "contactInbox.contactId",
  }
  const CONVERSATION_MODEL = { __name: "conversationModel" }
  const CONTACTS_TO_TAGS_MODEL = { __name: "contactsToTagsModel" }

  const tx = {
    insert: vi.fn((table: unknown) => {
      if (table === CONTACT_MODEL) {
        return { values: (v: unknown) => insertContact(v) }
      }
      if (table === CONTACT_INBOX_MODEL) {
        return {
          values: (v: unknown) => {
            insertContactInboxValues(v)
            return {
              onConflictDoNothing: () => ({
                returning: () => insertContactInboxReturning(),
              }),
            }
          },
        }
      }
      if (table === CONVERSATION_MODEL) {
        return { values: (v: unknown) => insertConversationValues(v) }
      }
      if (table === CONTACTS_TO_TAGS_MODEL) {
        return {
          values: (v: unknown) => ({
            onConflictDoNothing: () => insertTagsOnConflictDoNothing(v),
          }),
        }
      }
      return { values: vi.fn() }
    }),
    delete: vi.fn(() => ({
      where: (...args: unknown[]) => deleteContactWhere(...args),
    })),
  }

  return {
    insertContact,
    insertContactInboxValues,
    insertContactInboxReturning,
    deleteContactWhere,
    insertConversationValues,
    insertTagsOnConflictDoNothing,
    cancelByInboxSource,
    insertNormalizedValuesForNewContacts,
    tx,
    CONTACT_MODEL,
    CONTACT_INBOX_MODEL,
    CONVERSATION_MODEL,
    CONTACTS_TO_TAGS_MODEL,
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: (fn: (tx: unknown) => unknown) => fn(tx),
  },
  inArray: (a: unknown, b: unknown) => ({ inArray: [a, b] }),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  contactSources: { enum: { imported: "imported" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: CONTACT_MODEL,
  contactInboxModel: CONTACT_INBOX_MODEL,
  contactsToTagsModel: CONTACTS_TO_TAGS_MODEL,
  conversationModel: CONVERSATION_MODEL,
}))

vi.mock("@chatbotx.io/utils", () => ({ createId: vi.fn(() => "generated-id") }))

vi.mock("../src/contact-custom-field/service", () => ({
  contactCustomFieldService: {
    insertNormalizedValuesForNewContacts: (...a: unknown[]) =>
      insertNormalizedValuesForNewContacts(...a),
  },
}))

vi.mock("../src/message-cleanup/service", () => ({
  messageCleanupService: {
    cancelByInboxSource: (...a: unknown[]) => cancelByInboxSource(...a),
  },
}))

vi.mock("../src/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

// contactService is imported by insert-imported-batch.ts to attach the method
// onto it — stub a minimal object so Object.assign has a target.
vi.mock("../src/contact/service", () => ({
  contactService: {},
  ContactService: class {},
}))

const { insertImportedContactBatch } = await import(
  "../src/contact/insert-imported-batch"
)

beforeEach(() => {
  vi.clearAllMocks()
  insertContactInboxReturning.mockResolvedValue([])
})

const baseInput = {
  workspaceId: "ws-1",
  inbox: { id: "inbox-1", channel: "whatsapp" as const },
}

describe("insertImportedContactBatch", () => {
  test("returns { inserted: 0, orphanCount: 0 } without a transaction when accepted is empty", async () => {
    const result = await insertImportedContactBatch({
      ...baseInput,
      accepted: [],
    })

    expect(result).toEqual({ inserted: 0, orphanCount: 0 })
    expect(tx.insert).not.toHaveBeenCalled()
  })

  // Relocated from apps/worker/__tests__/import-contacts-handler.test.ts's
  // "BSUID-only row creates a BSUID-keyed ContactInbox" case: the worker test
  // can no longer see the row values now that it mocks this method.
  test("maps each accepted row onto a Contact row and a ContactInbox row", async () => {
    insertContactInboxReturning.mockResolvedValue([{ contactId: "c-1" }])

    await insertImportedContactBatch({
      ...baseInput,
      accepted: [
        {
          contactId: "c-1",
          contactInboxId: "ci-1",
          row: {
            externalId: "user.9373928427292738",
            sourceUserId: "user.9373928427292738",
            phoneNumber: "+15551234567",
            email: "a@example.com",
            firstName: "Ada",
            lastName: "Lovelace",
            customFields: [],
          },
        },
      ],
    })

    expect(insertContact).toHaveBeenCalledWith([
      {
        id: "c-1",
        workspaceId: baseInput.workspaceId,
        phoneNumber: "+15551234567",
        email: "a@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
      },
    ])
    // A BSUID-only row is keyed by its sourceUserId: sourceId equals it.
    expect(insertContactInboxValues).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "ci-1",
        contactId: "c-1",
        originalContactId: "c-1",
        inboxId: baseInput.inbox.id,
        channel: baseInput.inbox.channel,
        sourceId: "user.9373928427292738",
        sourceUserId: "user.9373928427292738",
      }),
    ])
  })

  test("throws the externalId invariant when a row lacks externalId", async () => {
    await expect(
      insertImportedContactBatch({
        ...baseInput,
        accepted: [
          {
            contactId: "c-1",
            contactInboxId: "ci-1",
            row: { externalId: null, customFields: [] },
          },
        ],
      }),
    ).rejects.toThrow("Invariant: externalId must be set before insert")
  })

  test("orphan prune fires when a contact-inbox insert conflicts", async () => {
    // Two accepted rows; only c-1's inbox insert survives the conflict.
    insertContactInboxReturning.mockResolvedValue([{ contactId: "c-1" }])

    const result = await insertImportedContactBatch({
      ...baseInput,
      accepted: [
        {
          contactId: "c-1",
          contactInboxId: "ci-1",
          row: { externalId: "ext-1", customFields: [] },
        },
        {
          contactId: "c-2",
          contactInboxId: "ci-2",
          row: { externalId: "ext-2", customFields: [] },
        },
      ],
    })

    expect(result.orphanCount).toBe(1)
    expect(result.inserted).toBe(1)
    expect(deleteContactWhere).toHaveBeenCalled()
  })

  test("cancelByInboxSource receives the shared tx handle", async () => {
    insertContactInboxReturning.mockResolvedValue([{ contactId: "c-1" }])

    await insertImportedContactBatch({
      ...baseInput,
      accepted: [
        {
          contactId: "c-1",
          contactInboxId: "ci-1",
          row: { externalId: "ext-1", customFields: [] },
        },
      ],
    })

    expect(cancelByInboxSource).toHaveBeenCalledWith(
      expect.objectContaining({ inboxId: "inbox-1", tx }),
    )
  })

  test("tag insert only runs when tagId is present", async () => {
    insertContactInboxReturning.mockResolvedValue([{ contactId: "c-1" }])

    await insertImportedContactBatch({
      ...baseInput,
      accepted: [
        {
          contactId: "c-1",
          contactInboxId: "ci-1",
          row: { externalId: "ext-1", customFields: [] },
        },
      ],
    })
    expect(insertTagsOnConflictDoNothing).not.toHaveBeenCalled()

    vi.clearAllMocks()
    insertContactInboxReturning.mockResolvedValue([{ contactId: "c-1" }])

    await insertImportedContactBatch({
      ...baseInput,
      tagId: "tag-1",
      accepted: [
        {
          contactId: "c-1",
          contactInboxId: "ci-1",
          row: { externalId: "ext-1", customFields: [] },
        },
      ],
    })
    expect(insertTagsOnConflictDoNothing).toHaveBeenCalledWith([
      { contactId: "c-1", tagId: "tag-1" },
    ])
  })

  test("returns { inserted: 0 } without conversation/custom-field inserts when every row is an orphan", async () => {
    insertContactInboxReturning.mockResolvedValue([]) // nothing survives

    const result = await insertImportedContactBatch({
      ...baseInput,
      accepted: [
        {
          contactId: "c-1",
          contactInboxId: "ci-1",
          row: { externalId: "ext-1", customFields: [] },
        },
      ],
    })

    expect(result).toEqual({ inserted: 0, orphanCount: 1 })
    expect(insertConversationValues).not.toHaveBeenCalled()
    expect(insertNormalizedValuesForNewContacts).not.toHaveBeenCalled()
  })
})
