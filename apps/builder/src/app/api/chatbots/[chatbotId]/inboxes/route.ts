import { listInboxes } from "@/features/inboxes/queries"
import { listInboxesNuqs } from "@/features/inboxes/schemas/list-inboxes.schema"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  const searchParams = Object.fromEntries(req.nextUrl.searchParams)
  const search = listInboxesNuqs.parse(searchParams)

  const allInboxes = await listInboxes({
    ...search,
    chatbotId: (await params).chatbotId,
  })

  return NextResponse.json(allInboxes)
}
