import { listCustomFields } from "@/features/fields/queries"
import { listCustomFieldsSearchParams } from "@/features/fields/schemas/get-fields-schema"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  const searchParams = Object.fromEntries(req.nextUrl.searchParams)
  const search = listCustomFieldsSearchParams.parse(searchParams)

  const allCustomFields = await listCustomFields({
    ...search,
    chatbotId: (await params).chatbotId,
  })

  return NextResponse.json(allCustomFields)
}
