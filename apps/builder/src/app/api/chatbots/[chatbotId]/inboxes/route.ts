import { type NextRequest, NextResponse } from "next/server"
import { listInboxes } from "@/features/inboxes/queries"
import { listInboxesNuqs } from "@/features/inboxes/schemas/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params
    await assertCurrentUserCanAccessChatbot(chatbotId)

    const searchParams = Object.fromEntries(req.nextUrl.searchParams)
    const search = listInboxesNuqs.parse(searchParams)

    const allInboxes = await listInboxes({
      ...search,
      includes: ["integration"],
      chatbotId: (await params).chatbotId,
    })

    return NextResponse.json(allInboxes)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
