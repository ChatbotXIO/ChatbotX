"use server"

import { db } from "@aha.chat/database/client"
import { enrollContactsInSequenceBulk } from "@aha.chat/sequence-scheduler"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { calculateNextRunAtBulk } from "@/features/contact-sequences/utils/calculate-next-run-at"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type AddContactSequenceRequest,
  addContactSequenceRequest,
} from "../schemas/contact-sequence"

const CHUNK_SIZE = 1000

async function getExistingEnrollments(
  chatbotId: string,
  contactIds: string[],
  sequenceIds: string[],
): Promise<Set<string>> {
  const enrollments = await db.query.contactsOnSequenceModel.findMany({
    where: {
      chatbotId,
      contactId: { in: contactIds },
      sequenceId: { in: sequenceIds },
    },
    columns: {
      contactId: true,
      sequenceId: true,
    },
  })

  return new Set<string>(
    enrollments.map(
      (e: { contactId: string; sequenceId: string }) =>
        `${e.contactId}-${e.sequenceId}`,
    ),
  )
}

function getValidContacts(chatbotId: string, contactIds: string[]) {
  return db.query.contactModel.findMany({
    where: {
      chatbotId,
      id: { in: contactIds },
    },
    columns: {
      id: true,
    },
  })
}

function buildEnrollmentRecords(
  contacts: Array<{ id: string }>,
  sequenceIds: string[],
  existingKeys: Set<string>,
  nextRunAtMap: Map<string, { nextRunAt: Date; nextStepId: string | null }>,
  chatbotId: string,
  now: Date,
) {
  return contacts.flatMap((contact) =>
    sequenceIds
      .filter((sequenceId) => !existingKeys.has(`${contact.id}-${sequenceId}`))
      .map((sequenceId) => {
        const result = nextRunAtMap.get(sequenceId) ?? {
          nextRunAt: now,
          nextStepId: null,
        }
        return {
          contactId: contact.id,
          sequenceId,
          chatbotId,
          currentStep: 0,
          status: "active" as const,
          nextRunAt: result.nextRunAt,
          nextStepId: result.nextStepId,
          enrolledAt: now,
        }
      }),
  )
}

export const addContactSequenceAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(addContactSequenceRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: AddContactSequenceRequest
    }) => {
      const now = new Date()
      const nextRunAtMap = await calculateNextRunAtBulk(
        parsedInput.sequences,
        now,
      )

      const existingKeys = await getExistingEnrollments(
        chatbotId,
        parsedInput.ids,
        parsedInput.sequences,
      )

      for (let i = 0; i < parsedInput.ids.length; i += CHUNK_SIZE) {
        const contactIdChunk = parsedInput.ids.slice(i, i + CHUNK_SIZE)

        const contacts = await getValidContacts(chatbotId, contactIdChunk)

        if (contacts.length === 0) {
          continue
        }

        const records = buildEnrollmentRecords(
          contacts,
          parsedInput.sequences,
          existingKeys,
          nextRunAtMap,
          chatbotId,
          now,
        )

        if (records.length === 0) {
          continue
        }

        await enrollContactsInSequenceBulk({
          chatbotId,
          enrollments: records.map((r) => ({
            contactId: r.contactId,
            sequenceId: r.sequenceId,
            nextRunAt: r.nextRunAt,
            nextStepId: r.nextStepId,
          })),
          enrolledAt: now,
        })
      }

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#sequences`,
      ])
    },
  )
