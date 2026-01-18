import { prisma } from "@aha.chat/database"
import { AuthType } from "@aha.chat/sdk"
import { type NextRequest, NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { klaviyoQuerySchema } from "@/features/integration-klaviyo/schemas"
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

    const query = klaviyoQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    )

    const klaviyoIntegration = await prisma.integrationKlaviyo.findFirst({
      where: { chatbotId },
      select: { apiKey: true },
    })

    if (!klaviyoIntegration?.apiKey) {
      return NextResponse.json(
        { message: t("klaviyo.notConnected"), errors: [] },
        { status: 400 },
      )
    }

    const auth = {
      apiKey: klaviyoIntegration.apiKey,
      authType: AuthType.secretText,
    }

    const { action } = query

    switch (action) {
      case "lists": {
        const data = await integrations.klaviyo.actions.getLists({
          ctx: { auth },
          props: {},
        })
        return NextResponse.json({ data })
      }
      case "tags": {
        const data = await integrations.klaviyo.actions.getTags({
          ctx: { auth },
          props: {},
        })
        return NextResponse.json({ data })
      }
      case "fields": {
        const data = await integrations.klaviyo.actions.getFields({
          ctx: { auth },
          props: {},
        })
        return NextResponse.json({ data })
      }
      default: {
        const _exhaustiveCheck: never = action
        return _exhaustiveCheck
      }
    }
  } catch (e) {
    return serverErrorHandler(e)
  }
}
