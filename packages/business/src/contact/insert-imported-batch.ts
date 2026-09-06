import { db, inArray } from "@chatbotx.io/database/client"
import { contactSources } from "@chatbotx.io/database/partials"
import {
  contactInboxModel,
  contactModel,
  contactsToTagsModel,
  conversationModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { contactCustomFieldService } from "../contact-custom-field/service"
import { messageCleanupService } from "../message-cleanup/service"

export type InsertImportedContactBatchInput = {
  workspaceId: string
  inbox: { id: string; channel: string }
  accepted: {
    contactId: string
    contactInboxId: string
    row: {
      externalId?: string | null
      sourceUserId?: string | null
      phoneNumber?: string | null
      email?: string | null
      firstName?: string | null
      lastName?: string | null
      customFields: { customFieldId: string; value: string }[]
    }
  }[]
  tagId?: string
}

export type InsertImportedContactBatchResult = {
  inserted: number
  orphanCount: number
}

/**
 * Moved verbatim from `imports/handler/contacts/handler.ts` `insertContactBatch`'s
 * `db.transaction` body: the same insert-then-onConflictDoNothing survivor
 * logic, the orphan prune, the conversation insert, and the normalized
 * custom-field insert. The only behavior change is that the `logger.warn`
 * about conflicts moved OUT of the transaction — this returns `orphanCount`
 * and the caller logs it, so the transaction itself never logs.
 */
export async function insertImportedContactBatch(
  input: InsertImportedContactBatchInput,
): Promise<InsertImportedContactBatchResult> {
  const { workspaceId, inbox, accepted, tagId } = input

  if (accepted.length === 0) {
    return { inserted: 0, orphanCount: 0 }
  }

  return await db.transaction(async (tx) => {
    await tx.insert(contactModel).values(
      accepted.map(({ contactId, row }) => ({
        id: contactId,
        workspaceId,
        phoneNumber: row.phoneNumber,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
      })),
    )

    // A duplicate should already have been removed by the caller's re-check,
    // but a non-import path (e.g. a concurrent inbound message creating the
    // same (inboxId, sourceId)) can still win the race in the window between
    // that re-check and this insert. `onConflictDoNothing` skips those rows;
    // we then continue with only the contacts whose link actually inserted,
    // so a single late conflict can no longer fail the entire batch while
    // still guaranteeing no contact is created without its inbox row.
    const insertedContactInboxes = await tx
      .insert(contactInboxModel)
      .values(
        accepted.map(({ contactId, contactInboxId, row }) => {
          // externalId is guaranteed non-null here by the caller, but assert
          // explicitly rather than casting to catch future regressions.
          if (!row.externalId) {
            throw new Error("Invariant: externalId must be set before insert")
          }
          return {
            id: contactInboxId,
            originalContactId: contactId,
            contactId,
            inboxId: inbox.id,
            channel: inbox.channel,
            source: contactSources.enum.imported,
            sourceId: row.externalId,
            sourceUserId: row.sourceUserId ?? null,
          }
        }),
      )
      .onConflictDoNothing()
      .returning({ contactId: contactInboxModel.contactId })

    const insertedContactIds = new Set(
      insertedContactInboxes.map((inboxRow) => inboxRow.contactId),
    )
    const survivors = accepted.filter(({ contactId }) =>
      insertedContactIds.has(contactId),
    )

    // Re-created contacts keep their history: cancel any pending message
    // cleanup recorded when contacts with these inbox identities were deleted.
    await messageCleanupService.cancelByInboxSource({
      inboxId: inbox.id,
      sourceIds: survivors.flatMap(({ row }) =>
        row.externalId ? [row.externalId] : [],
      ),
      tx,
    })

    // Prune the orphan Contact rows whose link lost the conflict so we never
    // leave a contact without a channel row (cascades clean up any partial
    // children).
    let orphanCount = 0
    if (survivors.length !== accepted.length) {
      const orphanIds = accepted
        .filter(({ contactId }) => !insertedContactIds.has(contactId))
        .map(({ contactId }) => contactId)
      await tx.delete(contactModel).where(inArray(contactModel.id, orphanIds))
      orphanCount = orphanIds.length
    }

    if (survivors.length === 0) {
      return { inserted: 0, orphanCount }
    }

    await tx.insert(conversationModel).values(
      survivors.map(({ contactId }) => ({
        id: createId(),
        workspaceId,
        contactId,
      })),
    )

    await contactCustomFieldService.insertNormalizedValuesForNewContacts({
      workspaceId,
      entries: survivors.map(({ contactId, row }) => ({
        contactId,
        fields: row.customFields,
      })),
      tx,
    })

    if (tagId) {
      await tx
        .insert(contactsToTagsModel)
        .values(survivors.map(({ contactId }) => ({ contactId, tagId })))
        .onConflictDoNothing()
    }

    return { inserted: survivors.length, orphanCount }
  })
}
