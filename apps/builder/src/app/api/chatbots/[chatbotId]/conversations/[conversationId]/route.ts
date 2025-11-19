import { type NextRequest, NextResponse } from "next/server"
import { findConversation } from "@/features/conversations/queries/list-conversations.query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(
  _req: NextRequest,
  {
    params,
  }: { params: Promise<{ conversationId: string; chatbotId: string }> },
) {
  try {
    const { chatbotId, conversationId } = await params
    await assertCurrentUserCanAccessChatbot(chatbotId)

    const result = await findConversation({ id: conversationId, chatbotId })

    return NextResponse.json(result)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
