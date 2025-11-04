import { type NextRequest, NextResponse } from "next/server"
import { findMessage } from "@/features/messages/queries/list-messages.query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string; chatbotId: string }> },
) {
  try {
    const { chatbotId, messageId } = await params
    await assertCurrentUserCanAccessChatbot(chatbotId)

    const result = await findMessage({ id: messageId, chatbotId })

    return NextResponse.json(result)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
