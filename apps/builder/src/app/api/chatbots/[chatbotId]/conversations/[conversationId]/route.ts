import { findConversation } from "@/features/conversations/queries/get-conversations.query"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  _req: NextRequest,
  {
    params,
  }: { params: Promise<{ conversationId: string; chatbotId: string }> },
) {
  const { chatbotId, conversationId } = await params

  const result = await findConversation({ id: conversationId, chatbotId })

  return NextResponse.json(result)
}
