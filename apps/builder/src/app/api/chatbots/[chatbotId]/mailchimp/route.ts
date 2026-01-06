import { prisma } from "@aha.chat/database"
import type { MailchimpAuthValue } from "@aha.chat/integration-mailchimp"
import { type NextRequest, NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"

import { mailchimpQuerySchema } from "@/features/integration-mailchimp/schemas"
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

    const query = mailchimpQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    )

    const mailchimpIntegration = await prisma.integrationMailchimp.findFirst({
      where: { chatbotId },
      select: { auth: true },
    })

    if (!mailchimpIntegration?.auth) {
      return NextResponse.json(
        { message: t("mailchimp.notConnected"), errors: [] },
        { status: 400 },
      )
    }

    const auth = mailchimpIntegration.auth as unknown as MailchimpAuthValue

    switch (query.action) {
      case "lists": {
        const data = await integrations.mailchimp.actions.listAudiences({
          ctx: { auth },
        })
        return NextResponse.json({ data })
      }
      case "tags": {
        const data = await integrations.mailchimp.actions.listTags({
          ctx: { auth },
          props: { listId: query.listId },
        })
        return NextResponse.json({ data })
      }
      case "merge-fields": {
        const data = await integrations.mailchimp.actions.listMergeFields({
          ctx: { auth },
          props: { listId: query.listId },
        })
        return NextResponse.json({ data })
      }
      default: {
        const _exhaustiveCheck: never = query
        return _exhaustiveCheck
      }
    }
  } catch (e) {
    return serverErrorHandler(e)
  }
}
