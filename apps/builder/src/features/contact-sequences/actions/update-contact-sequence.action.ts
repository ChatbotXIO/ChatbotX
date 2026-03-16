"use server"

import {
  and,
  db,
  eq,
  inArray,
  type Transaction,
} from "@aha.chat/database/client"
import {
  contactModel,
  contactsOnSequenceModel,
} from "@aha.chat/database/schema"
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
} from "../schemas/contact-sequence"
import { calculateNextRunAtBulk } from "../utils/calculate-next-run-at"

type DrizzleTransaction = Transaction

async function getCurrentSequenceIds(
  contactId: string,
  chatbotId: string,
  tx: DrizzleTransaction,
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
  contactId: string,
  sequenceIds: string[],
  chatbotId: string,
  tx: DrizzleTransaction,
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

  await Promise.all(
    enrollments.map((enrollment: { id: string }) =>
      cancelPendingDispatches({
        enrollmentId: enrollment.id,
        chatbotId,
        reason: "enrollment_removed",
        client: tx,
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
  contactId: string,
  sequenceIds: string[],
  chatbotId: string,
  tx: DrizzleTransaction,
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
      const contacts = await db
        .select()
        .from(contactModel)
        .where(
          and(
            eq(contactModel.id, parsedInput.contactId),
            eq(contactModel.chatbotId, chatbotId),
          ),
        )
        .limit(1)

      const contact = contacts[0]
      if (!contact) {
        throw new Error("Contact not found")
      }

      const returnedSequences = await db.transaction(async (tx) => {
        const currentIds = await getCurrentSequenceIds(
          contact.id,
          chatbotId,
          tx,
        )
        const { toAdd, toRemove } = calculateSequenceDiff(
          currentIds,
          parsedInput.sequences,
        )

        await removeContactSequences(contact.id, toRemove, chatbotId, tx)
        await addContactSequences(contact.id, toAdd, chatbotId, tx)

        const result = await tx.query.contactsOnSequenceModel.findMany({
          where: {
            contactId: contact.id,
            chatbotId,
          },
          with: { sequence: true },
        })
        return result
      })

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
        `chatbots:${chatbotId}#sequences`,
      ])

      return returnedSequences
    },
  )
