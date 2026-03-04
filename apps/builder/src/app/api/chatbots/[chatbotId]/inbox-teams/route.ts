import { type NextRequest, NextResponse } from "next/server"
import { getInboxTeams } from "@/enterprise/features/inbox-teams/queries"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params
    await assertCurrentUserCanAccessChatbot(chatbotId)

    const data = await getInboxTeams({
      chatbotId,
    })

    return NextResponse.json(data)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
