import { type NextRequest, NextResponse } from "next/server"
import { getInboxTeams } from "@/features/inbox-teams/queries"
import { getCurrentUserId } from "@/lib/auth"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { findChatbotOrFail } from "@/lib/user-permissions"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params

    const userId = await getCurrentUserId()
    await findChatbotOrFail(userId, chatbotId)

    const data = await getInboxTeams({
      chatbotId,
    })

    return NextResponse.json(data)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
