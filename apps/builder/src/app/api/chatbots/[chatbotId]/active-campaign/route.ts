import { prisma } from "@aha.chat/database"
import { activeCampaignAuthValueSchema } from "@aha.chat/integration-active-campaign"
import { type NextRequest, NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"

import { activeCampaignQuerySchema } from "@/features/integration-active-campaign/schemas"
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

    const query = activeCampaignQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    )

    const acIntegration = await prisma.integrationActiveCampaign.findFirst({
      where: { chatbotId },
      select: { apiUrl: true, apiKey: true },
    })

    if (!acIntegration) {
      return NextResponse.json(
        { message: t("activeCampaign.notConnected"), errors: [] },
        { status: 400 },
      )
    }

    const { apiUrl, apiKey } = acIntegration

    if (!apiUrl) {
      return NextResponse.json(
        { message: t("activeCampaign.notConnected"), errors: [] },
        { status: 400 },
      )
    }

    if (!apiKey) {
      return NextResponse.json(
        { message: t("activeCampaign.notConnected"), errors: [] },
        { status: 400 },
      )
    }

    const auth = activeCampaignAuthValueSchema.parse({
      apiUrl,
      apiKey,
    })

    const { action } = query

    switch (action) {
      case "lists": {
        const data = await integrations.activeCampaign.actions.getLists({
          ctx: { auth },
          props: {},
        })
        return NextResponse.json({ data })
      }
      case "tags": {
        const data = await integrations.activeCampaign.actions.getTags({
          ctx: { auth },
          props: {},
        })
        return NextResponse.json({ data })
      }
      case "fields": {
        const data = await integrations.activeCampaign.actions.getCustomFields({
          ctx: { auth },
          props: {},
        })
        return NextResponse.json({ data })
      }
      case "automations": {
        const data = await integrations.activeCampaign.actions.getAutomations({
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
