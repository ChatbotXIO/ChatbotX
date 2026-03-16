"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { contactsOnSequenceModel } from "@aha.chat/database/schema"
import { cancelPendingDispatches } from "@aha.chat/sequence-scheduler"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type RemoveContactSequenceRequest,
  removeContactSequenceRequest,
} from "../schemas/contact-sequence"

const CHUNK_SIZE = 1000

export const removeContactSequenceAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(removeContactSequenceRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: RemoveContactSequenceRequest
    }) => {
      for (let i = 0; i < parsedInput.ids.length; i += CHUNK_SIZE) {
        const contactIdChunk = parsedInput.ids.slice(i, i + CHUNK_SIZE)

        const enrollments = await db.query.contactsOnSequenceModel.findMany({
          where: {
            contactId: { in: contactIdChunk },
            sequenceId: { in: parsedInput.sequences },
            chatbotId,
          },
          columns: {
            id: true,
          },
        })

        await Promise.all(
          enrollments.map((enrollment: { id: string }) =>
            cancelPendingDispatches({
              enrollmentId: enrollment.id,
              chatbotId,
              reason: "enrollment_removed",
            }),
          ),
        )

        const enrollmentIds = enrollments.map((e: { id: string }) => e.id)
        if (enrollmentIds.length > 0) {
          await db
            .delete(contactsOnSequenceModel)
            .where(
              and(
                inArray(contactsOnSequenceModel.id, enrollmentIds),
                eq(contactsOnSequenceModel.chatbotId, chatbotId),
              ),
            )
        }
      }

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#sequences`,
      ])
    },
  )
