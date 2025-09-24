"use server"

import type { OrganizationSettings } from "@aha.chat/database/types"
import { HandleRequestType } from "@aha.chat/sdk"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { findOrganization } from "@/features/organization/queries"
import { integrations } from "@/integration"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type ConnectGoogleSheetsSchema,
  connectGoogleSheetsSchema,
} from "../schemas"

export const connectGoogleSheets = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .inputSchema(connectGoogleSheetsSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: ConnectGoogleSheetsSchema
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const headersList = await headers()

      const organization = await findOrganization({ id: chatbotId })
      const googleSheetsSetting = (
        organization.settings as OrganizationSettings
      ).googleSheets
      if (!googleSheetsSetting) {
        throw new Error("Google Sheets setting is not valid")
      }

      const redirectUrl = (await integrations.GOOGLE_SHEETS.handleRequest?.({
        config: {
          ...googleSheetsSetting,
          redirectUrl: new URL(
            "/integrations/google-sheets/callback",
            parsedInput.referer,
          ).toString(),
        },
        req: new Request(
          new URL(
            HandleRequestType.GENERATE_AUTH_URL,
            headersList.get("x-url") ?? "",
          ),
        ),
      })) as string

      return redirect(redirectUrl)
    },
  )
