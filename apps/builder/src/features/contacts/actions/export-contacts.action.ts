"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { contactModel } from "@aha.chat/database/schema"
import type { UserModel } from "@aha.chat/database/types"
import { DefaultJobAction, defaultQueue } from "@aha.chat/worker-config"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type ExportContactsRequest,
  exportContactsRequest,
} from "../schemas/action"

export const exportContactsAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(exportContactsRequest)
  .action(
    async ({
      ctx: { user },
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      ctx: { user: UserModel }
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: ExportContactsRequest
    }) => {
      const { contactIds, fields } = parsedInput

      // Make sure the contacts exist
      const contactsCount = await db.$count(
        contactModel,
        and(
          eq(contactModel.chatbotId, chatbotId),
          inArray(contactModel.id, contactIds),
        ),
      )
      if (contactsCount === 0) {
        return returnValidationErrors(exportContactsRequest, {
          _errors: ["Validation Exception"],
          fields: {
            _errors: ["No contacts found"],
          },
        })
      }

      await Promise.all([
        defaultQueue.add(DefaultJobAction.exportContacts, {
          type: DefaultJobAction.exportContacts,
          data: {
            chatbotId,
            requestedUserId: user.id,
            contactIds,
            fields,
            outputPath: `/tmp/contacts-list-${Date.now()}.csv`,
            outputFormat: "csv",
          },
        }),
        defaultQueue.add(DefaultJobAction.sendAuditLog, {
          type: DefaultJobAction.sendAuditLog,
          data: {
            userId: user.id,
            chatbotId,
            action: "export",
            detail: "Contacts",
          },
        }),
      ])
    },
  )
