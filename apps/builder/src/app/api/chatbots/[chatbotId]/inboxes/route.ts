import { listInboxes } from "@/features/inboxes/queries"
import { getInboxesSearchParamsCache } from "@/features/inboxes/schemas/get-inboxes-schema"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  const searchParams = Object.fromEntries(req.nextUrl.searchParams)
  const search = getInboxesSearchParamsCache.parse(searchParams)

  const allInboxes = await listInboxes({
    ...search,
    chatbotId: (await params).chatbotId,
  })

  return NextResponse.json(allInboxes)
}
