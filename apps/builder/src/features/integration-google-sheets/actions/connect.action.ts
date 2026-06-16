"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { UserModel, WorkspaceModel } from "@chatbotx.io/database/types"
import { HandleRequestType } from "@chatbotx.io/sdk"
import { redirect } from "next/navigation"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { integrations } from "@/integration"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
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
        user: UserModel
        workspace: WorkspaceModel
      }
      parsedInput: ConnectGoogleSheetsSchema
    }) => {
      const googleCredential = await platformCredentialService.resolveForOwner({
        ownerId: ctx.workspace.ownerId,
        type: "google",
      })
      if (!googleCredential) {
        throw new ChatbotXException("Google Sheets App settings is not valid")
      }

      const originUrl = await getOriginUrlFromHeader()
      // The OAuth redirect_uri must be registered in the Google app (platform or
      // reseller-owned). A white-label custom domain is not registered there, so
      // we always send Google to the fixed broker callback and carry the
      // originating branded origin in `referer`; the callback relays back to it.
      // Mirrors the messenger/instagram authorize flow. See `oauth-referer.ts`.
      const redirectUrl = (await integrations.googleSheets.handleRequest?.({
        config: {
          ...googleCredential.config,
          redirectUrl: buildBrokerCallbackUrl(
            "/integrations/google-sheets/callback",
          ),
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
