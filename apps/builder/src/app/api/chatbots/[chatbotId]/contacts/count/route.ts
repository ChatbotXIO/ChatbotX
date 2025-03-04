import { countContacts } from "@/features/contacts/actions/list-contacts.action"
import { listContactsRequest } from "@/features/contacts/schemas/get-contacts-schema"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ chatbotId: string }>
  },
) {
  const { chatbotId } = await params

  const { data } = listContactsRequest.safeParse(request.nextUrl.searchParams)

  const result = await countContacts({
    chatbotId,
    ...data,
  })

  return NextResponse.json(result)
}
