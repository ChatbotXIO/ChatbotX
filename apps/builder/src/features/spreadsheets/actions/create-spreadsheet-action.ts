"use server"

import { prisma } from "@aha.chat/database"
import type { UserModel } from "@aha.chat/database/types"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import {
  type SaveSpreadsheetSchema,
  saveSpreadsheetSchema,
} from "../schemas/save-spreadsheet-schema"

export const createSpreadsheetAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .inputSchema(saveSpreadsheetSchema)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      ctx: { user: UserModel }
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: SaveSpreadsheetSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)
      await prisma.spreadsheet.create({
        data: {
          ...parsedInput,
          chatbotId,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#spreadsheets`)
    },
  )
