import { db } from "@aha.chat/database/client"
import {
  integrationGoogleSheetsModel,
  integrationModel,
} from "@aha.chat/database/schema"
import type {
  IntegrationType,
  OrganizationSettings,
} from "@aha.chat/database/types"
import type { AuthValue, Oauth2AuthValue } from "@aha.chat/sdk"
import { createId } from "@paralleldrive/cuid2"
import { notFound, redirect } from "next/navigation"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { findChatbotOrFail } from "@/features/chatbot/queries"
import { connectZaloHandler } from "@/features/integration-zalo/actions/connect-zalo.action"
import { findOrganization } from "@/features/organization/queries"
import { type IntegrationKey, integrations } from "@/integration"
import { logger } from "@/lib/log"

const stateValidationSchema = z.object({
  chatbotId: z.cuid2(),
  referer: z.url(),
})

export const handleCallback = async (
  integrationType: IntegrationType,
  req: NextRequest,
) => {
  if (!(integrationType in integrations)) {
    return notFound()
  }

  // Parse state params to get chatbot info
  const url = new URL(req.url)
  const rawState = JSON.parse(atob(url.searchParams.get("state") || ""))
  const { data: stateParams } = stateValidationSchema.safeParse(rawState)
  if (!stateParams) {
    logger.debug(url, "state is not valid")
    return notFound()
  }

  const targetIntegration = integrations[integrationType as IntegrationKey]

  if (!(targetIntegration && "handleRequest" in targetIntegration)) {
    logger.debug(`${integrationType} is missing handleRequest method`)
    return notFound()
  }

  // find chatbot and organization config
  const chatbot = await findChatbotOrFail({ id: stateParams.chatbotId })
  const organization = await findOrganization({ id: chatbot.organizationId })
  const organizationSettings =
    organization?.settings as unknown as OrganizationSettings

  let authResult: AuthValue
  let googleSheetsAuth: Oauth2AuthValue | null = null
  switch (integrationType) {
    case "zalo": {
      if (!organizationSettings.zalo) {
        return notFound()
      }

      await connectZaloHandler({
        zaloSettings: organizationSettings.zalo,
        chatbotId: stateParams.chatbotId,
        req,
      })

      return redirect(stateParams.referer)
    }

    case "googleSheets": {
      if (!organizationSettings.googleSheets) {
        return notFound()
      }

      logger.debug(req, "debug google sheets callback request")

      authResult = (await integrations.googleSheets.handleRequest?.({
        config: {
          ...organizationSettings.googleSheets,
          redirectUrl: new URL(
            "/integrations/google-sheets/callback",
            req.url,
          ).toString(),
        },
        req,
      })) as unknown as Oauth2AuthValue
      googleSheetsAuth = authResult
      break
    }

    default:
      return notFound()
  }

  if (!authResult) {
    return notFound()
  }

  await db.transaction(async (tx) => {
    const integrationId = createId()

    await tx.insert(integrationModel).values({
      id: integrationId,
      chatbotId: stateParams.chatbotId,
      integrationType,
    })

    if (integrationType === "googleSheets" && googleSheetsAuth) {
      await tx.insert(integrationGoogleSheetsModel).values({
        id: createId(),
        chatbotId: stateParams.chatbotId,
        integrationId,
        auth: googleSheetsAuth,
      })
    }
  })

  return redirect(stateParams.referer)
}
