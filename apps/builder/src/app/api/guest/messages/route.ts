import { db } from "@aha.chat/database/client"
import { type NextRequest, NextResponse } from "next/server"
import { handleCreateWebchatMessage } from "@/features/messages/actions/create-webchat-message.action"
import { listMessages } from "@/features/messages/queries"
import { createWebchatMessageRequest } from "@/features/messages/schema/mutation"
import { listGuestMessagesRequest } from "@/features/messages/schema/query"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(req: NextRequest) {
  try {
    const searchParams = Object.fromEntries(req.nextUrl.searchParams)
    const data = listGuestMessagesRequest.parse(searchParams)

    const conversation = await db.query.conversationModel.findFirst({
      where: {
        channel: "webchat",
        sourceId: data.guestConversationId,
      },
    })

    if (!conversation) {
      return NextResponse.json({
        data: [],
        nextCursor: null,
        prevCursor: null,
      })
    }

    const result = await listMessages({
      ...data,
      chatbotId: conversation.chatbotId,
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
