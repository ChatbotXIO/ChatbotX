import { prisma } from "@aha.chat/database"
import { AuthType } from "@aha.chat/sdk"
import { type NextRequest, NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { mailerLiteQuerySchema } from "@/features/integration-mailer-lite/schemas"
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

    const query = mailerLiteQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    )

    const mailerLiteIntegration = await prisma.integrationMailerLite.findFirst({
      where: { chatbotId },
      select: { apiKey: true },
    })

    if (!mailerLiteIntegration) {
      return NextResponse.json(
        { message: t("mailerlite.notConnected") },
        { status: 400 },
      )
    }

    const integration = integrations.mailerLite

    if (!integration) {
      throw new Error("MailerLite integration not found")
    }

    const auth = {
      apiKey: mailerLiteIntegration.apiKey,
      authType: AuthType.secretText,
    }

    const ctx = {
      auth,
      config: { chatbotId },
    }

    switch (query.action) {
      case "groups": {
        const groups = await integration.actions.getGroups({
          ctx,
          props: {},
        })
        return NextResponse.json(groups)
      }
      case "fields": {
        const fields = await integration.actions.getFields({
          ctx,
          props: {},
        })
        return NextResponse.json(fields)
      }
      case "testConnection": {
        const isValid = await integration.actions.testConnection({
          ctx,
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
