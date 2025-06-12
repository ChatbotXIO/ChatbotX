import { auth } from "@/auth"
import { findMessage } from "@/features/messages/queries/list-messages.query"
import { errorResponse } from "@/lib/error-handling"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string; chatbotId: string }> },
) {
  try {
    const { chatbotId, messageId } = await params

    const session = await auth()
    await findChatbotOrFail(session?.user.id, chatbotId)

    const result = await findMessage({ id: messageId, chatbotId })

    return NextResponse.json(result)
  } catch (e) {
    return errorResponse(e)
  }
}
