import { db } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
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

    const contactInbox = await db.query.contactInboxModel.findFirst({
      where: {
        channel: channelTypes.enum.webchat,
        sourceId: data.guestConversationId,
      },
      with: {
        conversation: true,
      },
    })

    if (!contactInbox) {
      return NextResponse.json({
        data: [],
        nextCursor: null,
        prevCursor: null,
      })
    }

    const conversation = contactInbox.conversation

    const result = await listMessages({
      ...data,
      workspaceId: conversation.workspaceId,
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
