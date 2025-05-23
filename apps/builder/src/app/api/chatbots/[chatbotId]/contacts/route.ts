import { auth } from "@/auth"
import { countContacts } from "@/features/contacts/queries/list-contacts.queries"
import { errorResponse } from "@/lib/error-handling"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params

    const session = await auth()
    await findChatbotOrFail(session?.user.id, chatbotId)

    const searchParams = request.nextUrl.searchParams
    const data = await countContacts({
      chatbotId,
      ...searchParams,
    })

    return NextResponse.json(data)
  } catch (e) {
    return errorResponse(e)
  }
}
