import { type NextRequest, NextResponse } from "next/server"
import { countContacts } from "@/features/contacts/queries/list-contacts.queries"
import { listContactsRequest } from "@/features/contacts/schemas/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params
    await assertCurrentUserCanAccessChatbot(chatbotId)

    const searchParams = listContactsRequest.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    )

    const result = await countContacts({
      chatbotId,
      ...searchParams,
    })

    return NextResponse.json(result)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
