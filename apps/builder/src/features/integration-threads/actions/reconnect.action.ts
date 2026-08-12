"use server"

import {
  integrationThreadsService,
  platformCredentialService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { generateAuthUrl } from "@chatbotx.io/integration-threads"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
import { workspaceActionClient } from "@/lib/safe-action"

export const reconnectThreadsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, integrationId], ctx }) => {
      const t = await getTranslations()
      const integrationThreads =
        await integrationThreadsService.findByIdForWorkspace({
          id: integrationId,
          workspaceId,
        })
      if (!integrationThreads) {
        throw new ChatbotXException(t("channels.reconnect.errors.notFound"))
      }

      const credential = await platformCredentialService.resolveForOwner({
        ownerId: ctx.workspace.ownerId,
        type: "threads",
      })
      if (!credential) {
        throw new ChatbotXException(t("messages.needToAddSettings"))
      }

      const referer = new URL(
        `/space/${workspaceId}/settings/channels?channel=threads`,
        await getOriginUrlFromHeader(),
      ).toString()

      return redirect(
        generateAuthUrl({
          clientId: credential.config.clientId,
          redirectUrl: buildBrokerCallbackUrl("/integrations/threads/callback"),
          stateParams: {
            workspaceId,
            referer,
            reconnectIntegrationId: integrationId,
          },
        }),
      )
    },
  )
