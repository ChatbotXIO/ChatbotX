import { IntegrationType, prisma } from "@aha.chat/database"
import type { OrganizationSettings } from "@aha.chat/database/types"
import type { ZaloAuthValue } from "@aha.chat/integration-zalo"
import type { BaseAuthValue, Oauth2AuthValue } from "@aha.chat/sdk"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { findChatbot } from "@/features/chatbot/queries"
import { findOrganization } from "@/features/organization/queries"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"

const stateValidationSchema = z.object({
  chatbotId: z.string().cuid2(),
  referer: z.string().url(),
})

export const handleCallback = async (integrationName: string, req: Request) => {
  if (!(integrationName in integrations)) {
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

  const targetIntegration =
    integrations[integrationName as keyof typeof integrations]

  if (!(targetIntegration && "handleRequest" in targetIntegration)) {
    logger.warn(`${integrationName} is missing handleRequest method`)
    return notFound()
  }

  // find chatbot and organization config
  const chatbot = await findChatbot({ id: stateParams.chatbotId })
  const organization = await findOrganization({ id: chatbot.organizationId })
  const organizationSettings =
    organization?.settings as unknown as OrganizationSettings

  let authResult: BaseAuthValue
  let additionalIntegrationCreationData = {}

  switch (integrationName) {
    case IntegrationType.ZALO: {
      if (!organizationSettings.zalo) {
        return notFound()
      }

      authResult = (await integrations.ZALO.handleRequest?.({
        config: {
          ...organizationSettings.zalo,
          redirectUrl: new URL(
            "/integrations/zalo/callback",
            req.url,
          ).toString(),
          stateParams: {
            chatbotId: stateParams.chatbotId,
          },
        },
        req,
      })) as unknown as BaseAuthValue

      await prisma.$transaction(async (tx) => {
        await tx.inbox.create({
          data: {
            chatbotId: stateParams.chatbotId,
            inboxType: IntegrationType.ZALO,
            sourceId: (authResult as ZaloAuthValue).oaId,
            integrationZalo: {
              create: {
                chatbotId: stateParams.chatbotId,
                oaId: (authResult as ZaloAuthValue).oaId,
                auth: authResult,
              },
            },
          },
        })
      })
      return redirect(stateParams.referer)
    }

    case IntegrationType.GOOGLE_SHEETS: {
      if (!organizationSettings.googleSheets) {
        return notFound()
      }

      authResult = integrations.GOOGLE_SHEETS.handleRequest?.({
        config: {
          ...organizationSettings.googleSheets,
          redirectUrl: new URL(
            "/integrations/google-sheets/callback",
            req.url,
          ).toString(),
        },
        req,
      }) as unknown as Oauth2AuthValue

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
    const integrationType = integrationName
      .replace(/-/g, "_")
      .toUpperCase() as IntegrationType

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
