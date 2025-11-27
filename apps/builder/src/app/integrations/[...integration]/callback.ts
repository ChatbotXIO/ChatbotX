import { prisma } from "@aha.chat/database"
import type { OrganizationSettings } from "@aha.chat/database/types"
import { IntegrationType } from "@aha.chat/database/types"
import type { BaseAuthValue, Oauth2AuthValue } from "@aha.chat/sdk"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { findChatbot } from "@/features/chatbot/queries"
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
  req: Request,
) => {
  if (!(integrationType in integrations)) {
    return notFound()
  }

  // Parse state params to get chatbot info
  const url = new URL(req.url)
  const rawState = JSON.parse(atob(url.searchParams.get("state") || ""))
  const { data: stateParams } = stateValidationSchema.safeParse(rawState)
  if (!stateParams) {
    logger.warn("state is not valid", url)
    return notFound()
  }

  const targetIntegration = integrations[integrationType as IntegrationKey]

  if (!(targetIntegration && "handleRequest" in targetIntegration)) {
    logger.warn(`${integrationType} is missing handleRequest method`)
    return notFound()
  }

  // find chatbot and organization config
  const chatbot = await findChatbot({ id: stateParams.chatbotId })
  const organization = await findOrganization({ id: chatbot.organizationId })
  const organizationSettings =
    organization?.settings as unknown as OrganizationSettings

  let authResult: BaseAuthValue
  let additionalIntegrationCreationData = {}
  switch (integrationType) {
    case IntegrationType.zalo: {
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

    case IntegrationType.googleSheets: {
      if (!organizationSettings.googleSheets) {
        return notFound()
      }

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

      additionalIntegrationCreationData = {
        googleSheets: {
          create: {
            chatbotId: stateParams.chatbotId,
            auth: authResult,
          },
        },
      }
      break
    }

    default:
      return notFound()
  }

  if (!authResult) {
    return notFound()
  }

  await prisma.$transaction(async (tx) => {
    // create intergration
    await tx.integration.create({
      data: {
        chatbotId: stateParams.chatbotId,
        integrationType,
        ...additionalIntegrationCreationData,
      },
    })
  })

  return redirect(stateParams.referer)
}
