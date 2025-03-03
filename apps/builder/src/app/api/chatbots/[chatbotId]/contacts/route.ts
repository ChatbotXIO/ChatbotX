import { countContacts } from "@/features/contacts/actions/list-contacts.action"
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
  const searchParams = request.nextUrl.searchParams

  const data = await countContacts({
    chatbotId,
    ...searchParams,
  })

  return NextResponse.json(data)
}
