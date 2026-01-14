import { prisma } from "@aha.chat/database"
import { AuthType } from "@aha.chat/sdk"
import { type NextRequest, NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { dripQuerySchema } from "@/features/integration-drip/schemas"
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

    const query = dripQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    )

    const dripIntegration = await prisma.integrationDrip.findFirst({
      where: { chatbotId },
      select: { apiToken: true, accountId: true },
    })

    if (!dripIntegration?.apiToken) {
      return NextResponse.json(
        { message: t("drip.notConnected"), errors: [] },
        { status: 400 },
      )
    }

    const auth = {
      apiToken: dripIntegration.apiToken,
      accountId: dripIntegration.accountId,
      authType: AuthType.secretText,
    }

    const { action } = query

    switch (action) {
      case "accounts": {
        const data = await integrations.drip.actions.getAccounts({
          ctx: { auth },
          props: {},
        })
        return NextResponse.json({ data })
      }
      case "tags": {
        const data = await integrations.drip.actions.getTags({
          ctx: { auth },
          props: {},
        })
        return NextResponse.json({ data })
      }
      case "fields": {
        const data = await integrations.drip.actions.getCustomFields({
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
