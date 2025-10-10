import { type NextRequest, NextResponse } from "next/server"
import { listMessages } from "@/features/messages/queries/list-messages.query"
import { listMessagesRequest } from "@/features/messages/schemas/list-messages.schema"
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
    const data = listMessagesRequest.parse(searchParams)

    const result = await listMessages(chatbotId, data)

    return NextResponse.json(result)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
