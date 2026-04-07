import { type DatabaseClient, db, inArray } from "@chatbotx.io/database/client"
import { contactsOnSequenceModel } from "@chatbotx.io/database/schema"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import { cancelPendingDispatches } from "./dispatch-manager"

export const contactsOnSequencesUtils = {
  getAllSequenceIds: async (
    dbClient: DatabaseClient,
    where: { contactId: string },
  ): Promise<string[]> => {
    return await dbClient.query.contactsOnSequenceModel
      .findMany({
        where,
        columns: {
          sequenceId: true,
        },
      })
      .then((sequences) => sequences.map((s) => s.sequenceId))
  },

  calculateSequenceDiff: (
    currentSequenceIds: string[],
    newSequenceIds: string[],
  ): { toAdd: string[]; toRemove: string[] } => {
    const currentSequenceIdSet = new Set(currentSequenceIds)
    const newSequenceIdSet = new Set(newSequenceIds)

    const toAdd = [...newSequenceIdSet].filter(
      (sequenceId) => !currentSequenceIdSet.has(sequenceId),
    )
    const toRemove = [...currentSequenceIdSet].filter(
      (sequenceId) => !newSequenceIdSet.has(sequenceId),
    )

    return { toAdd, toRemove }
  },

  bulkRemoveIds: async (
    dbClient: DatabaseClient,
    contactId: string,
    sequenceIds: string[],
  ) => {
    if (sequenceIds.length === 0) {
      return
    }

    const enrollments = await dbClient.query.contactsOnSequenceModel.findMany({
      where: {
        contactId,
        sequenceId: { in: sequenceIds },
      },
    })

    if (enrollments.length === 0) {
      return
    }

    await Promise.all(
      enrollments.map((enrollment) =>
        cancelPendingDispatches({
          enrollmentId: enrollment.id,
          workspaceId: enrollment.workspaceId,
          reason: "enrollment_removed",
          client: dbClient,
        }),
      ),
    )

    await dbClient.delete(contactsOnSequenceModel).where(
      inArray(
        contactsOnSequenceModel.id,
        enrollments.map((e) => e.id),
      ),
    )
  },
}

export type ContactsOnSequencesUtils = typeof contactsOnSequencesUtils

export async function getContactInboxes(
  workspaceId: string,
  contactId: string,
): Promise<ContactInboxModel[]> {
  const inboxes = await db.query.inboxModel.findMany({
    where: {
      workspaceId,
    },
    columns: {
      id: true,
    },
  })

  const contactInboxes = await db.query.contactInboxModel.findMany({
    where: {
      contactId,
      inboxId: {
        in: inboxes.map((inbox) => inbox.id),
      },
    },
  })

  return contactInboxes
}
