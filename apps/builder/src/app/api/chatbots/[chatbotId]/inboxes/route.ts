import { auth } from "@/auth"
import { listInboxes } from "@/features/inboxes/queries"
import { listInboxesNuqs } from "@/features/inboxes/schemas/list-inboxes.schema"
import { errorResponse } from "@/lib/error-handling"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params

    const session = await auth()
    await findChatbotOrFail(session?.user.id, chatbotId)

    const searchParams = Object.fromEntries(req.nextUrl.searchParams)
    const search = listInboxesNuqs.parse(searchParams)

    const allInboxes = await listInboxes({
      ...search,
      chatbotId: (await params).chatbotId,
    })

    return NextResponse.json(allInboxes)
  } catch (e) {
    return errorResponse(e)
  }
}
