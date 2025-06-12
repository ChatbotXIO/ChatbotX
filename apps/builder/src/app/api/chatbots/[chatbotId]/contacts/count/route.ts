import { auth } from "@/auth"
import { countContacts } from "@/features/contacts/queries/list-contacts.queries"
import { listContactsRequest } from "@/features/contacts/schemas/get-contacts-schema"
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

    const searchParams = listContactsRequest.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    )

    const result = await countContacts({
      chatbotId,
      ...searchParams,
    })

    return NextResponse.json(result)
  } catch (e) {
    return errorResponse(e)
  }
}
