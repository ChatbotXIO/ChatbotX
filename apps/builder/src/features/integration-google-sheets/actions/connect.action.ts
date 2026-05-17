"use server"

import { organizationCredentialService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { HandleRequestType } from "@chatbotx.io/sdk"
import { redirect } from "next/navigation"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { integrations } from "@/integration"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type ConnectGoogleSheetsSchema,
  connectGoogleSheetsSchema,
} from "../schemas"

export const connectGoogleSheets = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectGoogleSheetsSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: {
        workspace: WorkspaceModel
      }
      parsedInput: ConnectGoogleSheetsSchema
    }) => {
      const googleCredential =
        await organizationCredentialService.findDecrypted({
          organizationId: ctx.workspace.organizationId,
          type: "google",
        })
      if (!googleCredential) {
        throw new ChatbotXException("Google Sheets App settings is not valid")
      }

      const originUrl = await getOriginUrlFromHeader()
      const redirectUrl = (await integrations.googleSheets.handleRequest?.({
        config: {
          ...googleCredential.config,
          redirectUrl: new URL(
            "/integrations/google-sheets/callback",
            parsedInput.referer,
          ).toString(),
          stateParams: {
            workspaceId: ctx.workspace.id,
            referer: parsedInput.referer,
          },
        },
        req: new Request(new URL(HandleRequestType.generateAuthUrl, originUrl)),
      })) as string

      return redirect(redirectUrl)
    },
  )
