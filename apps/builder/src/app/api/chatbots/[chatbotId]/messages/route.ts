import { listMessages } from "@/features/messages/queries/list-messages.query"
import { listMessagesRequest } from "@/features/messages/schemas/list-messages.schema"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  const { chatbotId } = await params
  const searchParams = Object.fromEntries(req.nextUrl.searchParams)
  const { data } = listMessagesRequest.safeParse(searchParams)

  const result = await listMessages(chatbotId, data ?? {})

  return NextResponse.json(result)
}
