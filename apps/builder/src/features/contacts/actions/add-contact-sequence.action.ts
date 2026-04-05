"use server"

import { db } from "@chatbotx.io/database/client"
import { enrollContactsInSequenceBulk } from "@chatbotx.io/sequence-scheduler"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { calculateNextRunAtBulk } from "@/features/contact-sequences/utils/calculate-next-run-at"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type AddContactSequenceRequest,
  addContactSequenceRequest,
} from "../schemas/contact-sequence"

const CHUNK_SIZE = 1000

async function getExistingEnrollments(
  workspaceId: string,
  contactIds: string[],
  sequenceIds: string[],
): Promise<Set<string>> {
  const enrollments = await db.query.contactsOnSequenceModel.findMany({
    where: {
      workspaceId,
      contactId: { in: contactIds },
      sequenceId: { in: sequenceIds },
    },
    columns: {
      contactId: true,
      sequenceId: true,
    },
  })

  return new Set<string>(
    enrollments.map((e) => `${e.contactId}-${e.sequenceId}`),
  )
}

function getValidContacts(workspaceId: string, contactIds: string[]) {
  return db.query.contactModel.findMany({
    where: {
      workspaceId,
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
  workspaceId: string,
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
          workspaceId,
          currentStep: 0,
          status: "active" as const,
          nextRunAt: result.nextRunAt,
          nextStepId: result.nextStepId,
          enrolledAt: now,
        }
      }),
  )
}

export const addContactSequenceAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(addContactSequenceRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
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
        workspaceId,
        parsedInput.ids,
        parsedInput.sequences,
      )

      for (let i = 0; i < parsedInput.ids.length; i += CHUNK_SIZE) {
        const contactIdChunk = parsedInput.ids.slice(i, i + CHUNK_SIZE)

        const contacts = await getValidContacts(workspaceId, contactIdChunk)

        if (contacts.length === 0) {
          continue
        }

        const records = buildEnrollmentRecords(
          contacts,
          parsedInput.sequences,
          existingKeys,
          nextRunAtMap,
          workspaceId,
          now,
        )

        if (records.length === 0) {
          continue
        }

        await enrollContactsInSequenceBulk({
          workspaceId,
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
        `workspaces:${workspaceId}#contacts`,
        `workspaces:${workspaceId}#sequences`,
      ])
    },
  )
