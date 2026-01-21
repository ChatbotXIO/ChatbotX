import { prisma } from "@aha.chat/database"
import { AuthType } from "@aha.chat/sdk"
import { type NextRequest, NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { getResponseQuerySchema } from "@/features/integration-get-response/schemas"
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

    const query = getResponseQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    )

    const getResponseIntegration =
      await prisma.integrationGetResponse.findFirst({
        where: { chatbotId },
        select: { apiKey: true },
      })

    if (!getResponseIntegration?.apiKey) {
      return NextResponse.json(
        { message: t("getResponse.notConnected"), errors: [] },
        { status: 400 },
      )
    }

    const auth = {
      apiKey: getResponseIntegration.apiKey,
      authType: AuthType.secretText,
    }

    const { action } = query

    switch (action) {
      case "campaigns": {
        const data = await integrations.getResponse.actions.getCampaigns({
          ctx: { auth },
          props: {},
        })
        return NextResponse.json({ data })
      }
      case "tags": {
        const data = await integrations.getResponse.actions.getTags({
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
