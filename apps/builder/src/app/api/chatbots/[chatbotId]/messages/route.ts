import { auth } from "@/auth"
import { listMessages } from "@/features/messages/queries/list-messages.query"
import { listMessagesRequest } from "@/features/messages/schemas/list-messages.schema"
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
    const { data } = listMessagesRequest.safeParse(searchParams)

    const result = await listMessages(chatbotId, data ?? {})

    return NextResponse.json(result)
  } catch (e) {
    return errorResponse(e)
  }
}
