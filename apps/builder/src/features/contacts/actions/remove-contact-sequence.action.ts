"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { contactsOnSequenceModel } from "@chatbotx.io/database/schema"
import { cancelPendingDispatches } from "@chatbotx.io/sequence-scheduler"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type RemoveContactSequenceRequest,
  removeContactSequenceRequest,
} from "../schemas/contact-sequence"

const CHUNK_SIZE = 1000

export const removeContactSequenceAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(removeContactSequenceRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
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
            workspaceId,
          },
          columns: {
            id: true,
          },
        })

        await Promise.all(
          enrollments.map((enrollment) =>
            cancelPendingDispatches({
              enrollmentId: enrollment.id,
              workspaceId,
              reason: "enrollment_removed",
            }),
          ),
        )

        const enrollmentIds = enrollments.map((e) => e.id)
        if (enrollmentIds.length > 0) {
          await db
            .delete(contactsOnSequenceModel)
            .where(
              and(
                inArray(contactsOnSequenceModel.id, enrollmentIds),
                eq(contactsOnSequenceModel.workspaceId, workspaceId),
              ),
            )
        }
      }

      revalidateCacheTags([
        `workspaces:${workspaceId}#contacts`,
        `workspaces:${workspaceId}#sequences`,
      ])
    },
  )
