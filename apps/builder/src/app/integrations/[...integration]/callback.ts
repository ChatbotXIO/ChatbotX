import { integrations } from "@/integration"
import { logger } from "@/lib/log"
import { IntegrationType, prisma } from "@ahachat.ai/database"
import type { BaseAuthValue, Oauth2AuthValue } from "@ahachat.ai/sdk"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

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

  if (
    !(
      "handleRequest" in
      integrations[integrationName as keyof typeof integrations].integration
    )
  ) {
    logger.warn(`${integrationName} is missing handleRequest method`)
    return notFound()
  }

  let authResult: BaseAuthValue
  let additionalIntegrationCreationData = {}

  switch (integrationName) {
    case IntegrationType.GOOGLE_SHEETS: {
      authResult = integrations.GOOGLE_SHEETS.integration.handleRequest?.({
        config: integrations.GOOGLE_SHEETS.getIntegrationConfig(),
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
    let integration = await tx.integration.findFirst({
      where: {
        chatbotId: stateParams.chatbotId,
        integrationType,
      },
    })
    if (!integration) {
      integration = await tx.integration.create({
        data: {
          chatbotId: stateParams.chatbotId,
          integrationType,
          ...additionalIntegrationCreationData,
        },
      })
    }
  })

  return redirect(stateParams.referer)
}
