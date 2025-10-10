import { InboxType, prisma } from "@aha.chat/database"
import { type NextRequest, NextResponse } from "next/server"
import { listMessages } from "@/features/messages/queries/list-messages.query"
import { listGuestMessagesRequest } from "@/features/messages/schemas/list-messages.schema"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(req: NextRequest) {
  try {
    const searchParams = Object.fromEntries(req.nextUrl.searchParams)
    const data = listGuestMessagesRequest.parse(searchParams)

    const conversation = await prisma.conversation.findFirst({
      where: {
        sourceId: data.guestConversationId,
        inbox: {
          inboxType: InboxType.WEBCHAT,
        },
      },
    })

    if (!conversation) {
      return NextResponse.json({
        data: [],
        nextCursor: null,
        prevCursor: null,
      })
    }

    const result = await listMessages(conversation.chatbotId, {
      ...data,
      conversationId: conversation.id,
    })

    return NextResponse.json(result)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
