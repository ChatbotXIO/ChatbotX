import { prisma } from "@aha.chat/database"
import { InboxType } from "@aha.chat/database/types"
import { type NextRequest, NextResponse } from "next/server"
import { handleCreateWebchatMessage } from "@/features/messages/actions/create-webchat-message.action"
import { listMessages } from "@/features/messages/queries/list-messages.query"
import { createWebchatMessageRequest } from "@/features/messages/schemas/create-message.schema"
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
          inboxType: InboxType.webchat,
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

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const parsedInput = createWebchatMessageRequest.parse(data)

    const message = await handleCreateWebchatMessage({ parsedInput })

    return NextResponse.json({
      data: message,
    })
  } catch (e) {
    return serverErrorHandler(e)
  }
}
