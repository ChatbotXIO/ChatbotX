import { prisma } from "@aha.chat/database"
import { AuthType } from "@aha.chat/sdk"
import { type NextRequest, NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { sendFoxQuerySchema } from "@/features/integration-send-fox/schemas"
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

    const query = sendFoxQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    )

    const sendFoxIntegration = await prisma.integrationSendFox.findFirst({
      where: { chatbotId },
      select: { accessToken: true },
    })

    if (!sendFoxIntegration) {
      return NextResponse.json(
        { message: t("sendFox.notConnected") },
        { status: 400 },
      )
    }

    const integration = integrations.sendFox

    if (!integration) {
      throw new Error("SendFox integration not found")
    }

    const auth = {
      accessToken: sendFoxIntegration.accessToken,
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
      default:
        return NextResponse.json({ message: "Invalid action" }, { status: 400 })
    }
  } catch (error) {
    return serverErrorHandler(error)
  }
}
