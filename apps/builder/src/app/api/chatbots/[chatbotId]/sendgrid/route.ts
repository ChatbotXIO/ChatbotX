import { prisma } from "@aha.chat/database"
import { AuthType } from "@aha.chat/sdk"
import { type NextRequest, NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { sendGridQuerySchema } from "@/features/integration-sendgrid/schemas"
import { integrations } from "@/integration"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const t = await getTranslations()
    const { chatbotId } = await params
    await assertCurrentUserCanAccessChatbot(chatbotId)

    const query = sendGridQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    )

    const sendGridIntegration = await prisma.integrationSendGrid.findFirst({
      where: { chatbotId },
      select: { apiKey: true },
    })

    if (!sendGridIntegration) {
      return NextResponse.json(
        { message: t("sendgrid.notConnected") },
        { status: 400 },
      )
    }

    const integration = integrations.sendgrid

    if (!integration) {
      throw new Error("SendGrid integration not found")
    }

    const auth = {
      apiKey: sendGridIntegration.apiKey,
      authType: AuthType.secretText,
    }

    switch (query.action) {
      case "lists": {
        const lists = await integration.actions.getLists({
          ctx: { auth },
          props: {},
        })
        return NextResponse.json(lists)
      }
      case "fields": {
        const fields = await integration.actions.getCustomFields({
          ctx: { auth },
          props: {},
        })
        return NextResponse.json(fields)
      }
      case "testConnection": {
        const isValid = await integration.actions.testConnection({
          ctx: { auth },
          props: {},
        })
        return NextResponse.json(isValid)
      }
      default:
        return NextResponse.json({ message: "Invalid action" }, { status: 400 })
    }
  } catch (error) {
    return serverErrorHandler(error)
  }
}
