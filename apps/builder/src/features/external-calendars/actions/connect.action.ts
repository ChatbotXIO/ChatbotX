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
import { resolvePlatformOwnerId } from "@/lib/platform-credential-owner"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectExternalCalendarRequest } from "../schemas/action"

export const connectGoogleCalendarAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectExternalCalendarRequest)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: {
        user: UserModel
        workspace: WorkspaceModel
      }
      parsedInput: { referer: string }
    }) => {
      const ownerId = await resolvePlatformOwnerId({
        userId: ctx.user.id,
        workspaceId: ctx.workspace.id,
      })
      const googleCredential = await platformCredentialService.resolveForOwner({
        ownerId,
        type: "google",
      })
      if (!googleCredential) {
        throw new ChatbotXException("Google App settings is not valid")
      }

      const originUrl = await getOriginUrlFromHeader()
      const authUrl = await integrations.googleCalendar.handleRequest?.({
        config: {
          ...googleCredential.config,
          redirectUrl: buildBrokerCallbackUrl(
            "/integrations/google-calendar/callback",
          ),
          stateParams: {
            workspaceId: ctx.workspace.id,
            referer: parsedInput.referer,
          },
        },
        req: new Request(new URL(HandleRequestType.generateAuthUrl, originUrl)),
      })

      if (typeof authUrl !== "string") {
        throw new ChatbotXException("Failed to connect Google Calendar")
      }

      return redirect(authUrl)
    },
  )
