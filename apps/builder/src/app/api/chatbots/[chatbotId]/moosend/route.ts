import { prisma } from "@aha.chat/database"
import { AuthType } from "@aha.chat/sdk"
import { type NextRequest, NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { moosendQuerySchema } from "@/features/integration-moosend/schemas"
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

    const query = moosendQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    )

    const moosendIntegration = await prisma.integrationMoosend.findFirst({
      where: { chatbotId },
      select: { apiKey: true },
    })

    if (!moosendIntegration) {
      return NextResponse.json(
        { message: t("moosend.notConnected") },
        { status: 400 },
      )
    }

    const integration = integrations.moosend

    if (!integration) {
      throw new Error("Moosend integration not found")
    }

    const auth = {
      apiKey: moosendIntegration.apiKey,
      authType: AuthType.secretText,
    }

    try {
      switch (query.action) {
        case "lists": {
          const lists = await integration.actions.getLists({
            ctx: { auth },
            props: {},
          })
          return NextResponse.json(lists)
        }
        default:
          return NextResponse.json(
            { message: "Invalid action" },
            { status: 400 },
          )
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      if (errorMessage.includes("USER_NOT_ENABLED")) {
        return NextResponse.json(
          { message: t("moosend.error.userNotEnabled") },
          { status: 400 },
        )
      }
      throw error
    }
  } catch (error) {
    return serverErrorHandler(error)
  }
}
