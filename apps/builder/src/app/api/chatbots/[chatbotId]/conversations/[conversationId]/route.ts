import { type NextRequest, NextResponse } from "next/server"
import { findConversation } from "@/features/conversations/queries/list-conversations.query"
import { getCurrentUserId } from "@/lib/auth"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { findChatbotOrFail } from "@/lib/user-permissions"

export async function GET(
  _req: NextRequest,
  {
    params,
  }: { params: Promise<{ conversationId: string; chatbotId: string }> },
) {
  try {
    const { chatbotId, conversationId } = await params

    const userId = await getCurrentUserId()
    await findChatbotOrFail(userId, chatbotId)

    const result = await findConversation({ id: conversationId, chatbotId })

    return NextResponse.json(result)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
