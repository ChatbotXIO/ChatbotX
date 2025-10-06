import { type NextRequest, NextResponse } from "next/server"
import { getIntegationWebchats } from "@/features/webchat/queries/get-webchats.query"
import { getWebchatRequest } from "@/features/webchat/schemas/webchat.schema"
import { getCurrentUserId } from "@/lib/auth"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { findChatbotOrFail } from "@/lib/user-permissions"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params

    const userId = await getCurrentUserId()
    await findChatbotOrFail(userId, chatbotId)

    const searchParams = Object.fromEntries(req.nextUrl.searchParams)
    const search = getWebchatRequest.parse(searchParams)

    const result = await getIntegationWebchats({
      ...search,
      chatbotId,
    })

    return NextResponse.json(result)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
