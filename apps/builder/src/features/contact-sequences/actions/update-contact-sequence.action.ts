"use server"

import {
  and,
  type DatabaseClient,
  db,
  eq,
  findOrFail,
  inArray,
} from "@aha.chat/database/client"
import {
  contactModel,
  contactsOnSequenceModel,
} from "@aha.chat/database/schema"
import type { ContactModel } from "@aha.chat/database/types"
import {
  cancelPendingDispatches,
  enrollContactInSequence,
} from "@aha.chat/sequence-scheduler"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateContactSequenceRequest,
  updateContactSequenceRequest,
} from "../schema"
import { calculateNextRunAtBulk } from "../utils/calculate-next-run-at"

async function getCurrentSequenceIds(
  tx: DatabaseClient,
  contactId: string,
  chatbotId: string,
) {
  const sequences = await tx
    .select({ sequenceId: contactsOnSequenceModel.sequenceId })
    .from(contactsOnSequenceModel)
    .where(
      and(
        eq(contactsOnSequenceModel.contactId, contactId),
        eq(contactsOnSequenceModel.chatbotId, chatbotId),
      ),
    )
  return sequences.map((s) => s.sequenceId)
}

function calculateSequenceDiff(
  currentIds: string[],
  newIds: string[],
): { toAdd: string[]; toRemove: string[] } {
  const currentSet = new Set(currentIds)
  const newSet = new Set(newIds)

  return {
    toAdd: newIds.filter((id) => !currentSet.has(id)),
    toRemove: currentIds.filter((id) => !newSet.has(id)),
  }
}

async function removeContactSequences(
  tx: DatabaseClient,
  contactId: string,
  sequenceIds: string[],
  chatbotId: string,
) {
  if (sequenceIds.length === 0) {
    return
  }

  const enrollments = await tx
    .select({ id: contactsOnSequenceModel.id })
    .from(contactsOnSequenceModel)
    .where(
      and(
        eq(contactsOnSequenceModel.contactId, contactId),
        inArray(contactsOnSequenceModel.sequenceId, sequenceIds),
        eq(contactsOnSequenceModel.chatbotId, chatbotId),
      ),
    )
  if (enrollments.length === 0) {
    return
  }

  await Promise.all(
    enrollments.map((enrollment: { id: string }) =>
      cancelPendingDispatches({
        client: tx,
        enrollmentId: enrollment.id,
        chatbotId,
        reason: "enrollment_removed",
      }),
    ),
  )

  const enrollmentIds = enrollments.map((e: { id: string }) => e.id)
  if (enrollmentIds.length > 0) {
    await tx
      .delete(contactsOnSequenceModel)
      .where(
        and(
          inArray(contactsOnSequenceModel.id, enrollmentIds),
          eq(contactsOnSequenceModel.chatbotId, chatbotId),
        ),
      )
  }
}

async function addContactSequences(
  tx: DatabaseClient,
  contactId: string,
  sequenceIds: string[],
  chatbotId: string,
) {
  if (sequenceIds.length === 0) {
    return
  }

  const now = new Date()
  const nextRunAtMap = await calculateNextRunAtBulk(sequenceIds, now, tx)

  for (const sequenceId of sequenceIds) {
    const result = nextRunAtMap.get(sequenceId) ?? {
      nextRunAt: now,
      nextStepId: null,
    }

    await enrollContactInSequence({
      chatbotId,
      contactId,
      sequenceId,
      nextRunAt: result.nextRunAt,
      nextStepId: result.nextStepId,
      enrolledAt: now,
      client: tx,
    })
  }
}

export const updateContactSequenceAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(updateContactSequenceRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: UpdateContactSequenceRequest
    }) => {
      const contact = await findOrFail<ContactModel>(
        contactModel,
        {
          id: parsedInput.contactId,
          chatbotId,
        },
        "Contact not found",
      )

      const currentIds = await getCurrentSequenceIds(db, contact.id, chatbotId)

      const returnedSequences = await db.transaction(async (tx) => {
        const { toAdd, toRemove } = calculateSequenceDiff(
          currentIds,
          parsedInput.sequences,
        )

        await removeContactSequences(tx, contact.id, toRemove, chatbotId)
        await addContactSequences(tx, contact.id, toAdd, chatbotId)

        return await tx.query.contactsOnSequenceModel.findMany({
          where: {
            contactId: contact.id,
            chatbotId,
          },
          with: { sequence: true },
        })
      })

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
        `chatbots:${chatbotId}#sequences`,
      ])

      return returnedSequences
    },
  )
