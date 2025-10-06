import { type NextRequest, NextResponse } from "next/server"
import { listConversations } from "@/features/conversations/queries/list-conversations.query"
import { listConversationsRequest } from "@/features/conversations/schemas/list-conversations.request"
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
    const { data } = listConversationsRequest.safeParse(searchParams)

    const result = await listConversations(chatbotId, data ?? {})

    return NextResponse.json(result)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
