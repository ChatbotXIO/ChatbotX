import { type NextRequest, NextResponse } from "next/server"
import { listConversations } from "@/features/conversations/queries/list-conversations.query"
import { listConversationsRequest } from "@/features/conversations/schemas/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params
    await assertCurrentUserCanAccessChatbot(chatbotId)

    const searchParams = await req.json()
    const { data } = listConversationsRequest.safeParse(searchParams)

    const result = await listConversations(chatbotId, data)

    return NextResponse.json(result)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
