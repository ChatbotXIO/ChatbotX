import { type NextRequest, NextResponse } from "next/server"
import { getAgents } from "@/features/chatbot-members/queries"
import { getChatbotMembersSearchParamsCache } from "@/features/chatbot-members/schemas/get-chatbot-members-schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params
    await assertCurrentUserCanAccessChatbot(chatbotId)

    const searchParams = getChatbotMembersSearchParamsCache.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    )
    const data = await getAgents({
      chatbotId,
      ...searchParams,
    })

    return NextResponse.json(data)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
