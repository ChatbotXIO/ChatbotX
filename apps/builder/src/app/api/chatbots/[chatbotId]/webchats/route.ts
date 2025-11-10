import { type NextRequest, NextResponse } from "next/server"
import { getIntegationWebchats } from "@/features/webchat/queries/get-webchats.query"
import { getWebchatRequest } from "@/features/webchat/schemas/webchat.schema"
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
