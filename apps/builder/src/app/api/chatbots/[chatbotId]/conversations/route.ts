import { auth } from "@/auth"
import { listConversations } from "@/features/conversations/queries/get-conversations.query"
import { listConversationsRequest } from "@/features/conversations/schemas/get-conversations.schema"
import { errorResponse } from "@/lib/error-handling"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params

    const session = await auth()
    await findChatbotOrFail(session?.user.id, chatbotId)

    const searchParams = Object.fromEntries(req.nextUrl.searchParams)
    const { data } = listConversationsRequest.safeParse(searchParams)

    const result = await listConversations(chatbotId, data ?? {})

    return NextResponse.json(result)
  } catch (e) {
    return errorResponse(e)
  }
}
