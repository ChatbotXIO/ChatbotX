"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type ExportContactsRequest,
  exportContactsRequest,
} from "../schemas/action"

export const exportContactsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(exportContactsRequest)
  .action(
    async ({
      ctx: { user },
      bindArgsParsedInputs: [workspaceId],
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
          eq(contactModel.workspaceId, workspaceId),
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
            workspaceId,
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
            workspaceId,
            action: "export",
            detail: "Contacts",
          },
        }),
      ])
    },
  )
