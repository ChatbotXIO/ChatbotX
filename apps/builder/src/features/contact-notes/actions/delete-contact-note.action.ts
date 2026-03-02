"use server"

import { and, db, eq, findOrFail } from "@aha.chat/database/client"
import { contactModel, contactNoteModel } from "@aha.chat/database/schema"
import type { ContactModel } from "@aha.chat/database/types"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type DeleteContactNoteRequest,
  deleteContactNoteRequest,
} from "../schemas/action"

export const deleteContactNoteAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(deleteContactNoteRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: DeleteContactNoteRequest
    }) => {
      const contact = await findOrFail<ContactModel>(
        contactModel,
        {
          id,
          chatbotId,
        },
        "Contact note not found",
      )

      await db
        .delete(contactNoteModel)
        .where(
          and(
            eq(contactNoteModel.id, parsedInput.id),
            eq(contactNoteModel.contactId, contact.id),
          ),
        )
    },
  )
