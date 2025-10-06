import { type NextRequest, NextResponse } from "next/server"
import { listInboxes } from "@/features/inboxes/queries"
import { listInboxesNuqs } from "@/features/inboxes/schemas/list-inboxes.schema"
import { getCurrentUserId } from "@/lib/auth"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { findChatbotOrFail } from "@/lib/user-permissions"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params

    const userId = await getCurrentUserId()
    await findChatbotOrFail(userId, chatbotId)

    const searchParams = Object.fromEntries(req.nextUrl.searchParams)
    const search = listInboxesNuqs.parse(searchParams)

    const allInboxes = await listInboxes({
      ...search,
      chatbotId: (await params).chatbotId,
    })

    return NextResponse.json(allInboxes)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
