import { listConversations } from "@/features/conversations/queries"
import { listConversationsSchema } from "@/features/conversations/schemas/get-conversations-schema"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  const searchParams = Object.fromEntries(req.nextUrl.searchParams)
  const { data, error } = listConversationsSchema.safeParse(searchParams)
  console.log("searchParamssearchParams", data, error)

  const result = await listConversations({
    ...data,
    chatbotId: (await params).chatbotId,
  })

  return NextResponse.json(result)
}
