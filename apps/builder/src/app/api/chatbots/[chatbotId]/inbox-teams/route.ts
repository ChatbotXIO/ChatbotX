import { auth } from "@/auth"
import { getInboxTeams } from "@/features/inbox-teams/queries"
import { errorResponse } from "@/lib/error-handling"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params

    const session = await auth()
    await findChatbotOrFail(session?.user.id, chatbotId)

    const data = await getInboxTeams({
      chatbotId,
    })

    return NextResponse.json(data)
  } catch (e) {
    return errorResponse(e)
  }
}
