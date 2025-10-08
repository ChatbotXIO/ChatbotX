import { type NextRequest, NextResponse } from "next/server"
import { findMessage } from "@/features/messages/queries/list-messages.query"
import { getCurrentUserId } from "@/lib/auth"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { findChatbotOrFail } from "@/lib/user-permissions"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string; chatbotId: string }> },
) {
  try {
    const { chatbotId, messageId } = await params

    const userId = await getCurrentUserId()
    await findChatbotOrFail(userId, chatbotId)

    const result = await findMessage({ id: messageId, chatbotId })

    return NextResponse.json(result)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
