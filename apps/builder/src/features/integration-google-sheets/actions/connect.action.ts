"use server"

import type { ChatbotModel } from "@aha.chat/database/types"
import { HandleRequestType } from "@aha.chat/sdk"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { findOrganizationSettingsByKey } from "@/features/organization/queries"
import { integrations } from "@/integration"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type ConnectGoogleSheetsSchema,
  connectGoogleSheetsSchema,
} from "../schemas"

export const connectGoogleSheets = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(connectGoogleSheetsSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: {
        chatbot: ChatbotModel
      }
      parsedInput: ConnectGoogleSheetsSchema
    }) => {
      const headersList = await headers()

      const googleSheetsSetting = await findOrganizationSettingsByKey(
        { id: ctx.chatbot.organizationId },
        "google",
      )

      const redirectUrl = (await integrations.googleSheets.handleRequest?.({
        config: {
          ...googleSheetsSetting,
          redirectUrl: new URL(
            "/integrations/google-sheets/callback",
            parsedInput.referer,
          ).toString(),
          stateParams: {
            chatbotId: ctx.chatbot.id,
            referer: parsedInput.referer,
          },
        },
        req: new Request(
          new URL(
            HandleRequestType.generateAuthUrl,
            headersList.get("x-url") ?? "",
          ),
        ),
      })) as string

      return redirect(redirectUrl)
    },
  )
