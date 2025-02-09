import { logger } from "@/lib/log"
import { IntegrationType, prisma } from "@ahachat.ai/database"
import { integration as googleSheets } from "@ahachat.ai/integration-google-sheets"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

enum IntegrationHandlerAction {
  NewChatbot = "new-chatbot",
  Callback = "callback",
  Webhook = "webhook",
}

const channels = ["whatsapp"]

const stateValidationSchema = z.object({
  chatbotId: z.string().cuid2(),
  providerName: z.enum(["google-sheets"]),
  referer: z.string().url(),
})
type StateValidationSchema = z.infer<typeof stateValidationSchema>

const newChatbotValidationSchema = z.object({
  chatbotId: z.string().cuid2(),
})
type NewChatbotValidationShema = z.infer<typeof newChatbotValidationSchema>

async function handleCallback(
  providerName: string,
  chatbotId: string,
  code: string,
  parentUrl: string,
) {
  if (providerName !== "google-sheets") {
    return notFound()
  }

  try {
    await prisma.chatbot.findFirstOrThrow({
      where: { id: chatbotId },
    })

    const auth = await googleSheets.authorize?.({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
      redirectUri: `${process.env.BASE_URL}/api/integrations/callback`,
      code,
    })

    if (!auth) {
      logger.warn("Missing authorize method")
      return notFound()
    }

    // save data to chatbot
    await prisma.$transaction(async (tx) => {
      // create intergration
      let integration = await tx.integration.findFirst({
        where: {
          chatbotId,
          integrationType: IntegrationType.GoogleSheets,
        },
      })
      if (!integration) {
        integration = await tx.integration.create({
          data: {
            chatbotId,
            integrationType: IntegrationType.GoogleSheets,
          },
        })
      }

      // create intergrationGoogleSheets
      await tx.integrationGoogleSheets.upsert({
        where: {
          integrationId: integration.id,
        },
        create: {
          chatbotId,
          integrationId: integration.id,
          auth,
        },
        update: {
          auth,
        },
      })
    })
  } catch (error) {
    logger.error("Error in callback", error)
    return notFound()
  }

  return redirect(parentUrl)
}

async function handleNewChatbot(providerName: string, chatbotId?: string) {
  return "ok"
}

export default async function IntegrationHandlerPage(props: {
  params: Promise<{ integration: string[] }>
  searchParams: Promise<{ code: string; state: string }>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const action = params.integration[0] as IntegrationHandlerAction

  if (action === IntegrationHandlerAction.Callback) {
    // validate state
    let state: StateValidationSchema
    try {
      const rawState = JSON.parse(atob((searchParams.state as string) || ""))
      state = stateValidationSchema.parse(rawState)
    } catch (error) {
      console.log("state is not valid", error, searchParams.state)
      return notFound()
    }

    return await handleCallback(
      state.providerName,
      state.chatbotId,
      searchParams.code,
      state.referer,
    )
  }

  if (action === IntegrationHandlerAction.NewChatbot) {
    const providerName = params.integration[1] ?? ""

    if (!channels.includes(providerName)) {
      return notFound()
    }

    let validatedParams: NewChatbotValidationShema
    try {
      validatedParams = newChatbotValidationSchema.parse(searchParams)
    } catch (error) {
      logger.warn("request parameters are not valid", error, searchParams)
      return notFound()
    }

    return handleNewChatbot(providerName, validatedParams.chatbotId)
  }

  return notFound()
}
