import type { FilterContactSchema } from "@/features/contacts/filter/schema"
import { countContacts } from "@/features/contacts/queries"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ chatbotId: string; filter: FilterContactSchema }> },
) {
  const data = await countContacts({
    chatbotId: (await params).chatbotId,
    filter: (await params).filter,
  })

  return NextResponse.json(data)
}
