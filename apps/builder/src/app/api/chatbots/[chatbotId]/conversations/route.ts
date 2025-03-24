import { listConversations } from "@/features/conversations/queries/get-conversations.query"
import { listConversationsRequest } from "@/features/conversations/schemas/get-conversations.schema"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  const { chatbotId } = await params
  const searchParams = Object.fromEntries(req.nextUrl.searchParams)
  const { data } = listConversationsRequest.safeParse(searchParams)

  const result = await listConversations(chatbotId, data ?? {})

  return NextResponse.json(result)
}
