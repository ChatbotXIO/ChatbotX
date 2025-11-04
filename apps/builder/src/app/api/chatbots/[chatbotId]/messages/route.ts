import { type NextRequest, NextResponse } from "next/server"
import { listMessages } from "@/features/messages/queries/list-messages.query"
import { listMessagesRequest } from "@/features/messages/schemas/list-messages.schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params
    await assertCurrentUserCanAccessChatbot(chatbotId)

    const searchParams = Object.fromEntries(req.nextUrl.searchParams)
    const data = listMessagesRequest.parse(searchParams)

    const result = await listMessages(chatbotId, data)

    return NextResponse.json(result)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
