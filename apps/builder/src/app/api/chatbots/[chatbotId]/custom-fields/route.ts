import { listFields } from "@/features/fields/queries"
import { getFieldsSearchParamsCache } from "@/features/fields/schemas/get-fields-schema"
import { FieldType } from "@prisma/client"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  const searchParams = Object.fromEntries(req.nextUrl.searchParams)
  const search = getFieldsSearchParamsCache.parse(searchParams)

  const allCustomFields = await listFields({
    ...search,
    chatbotId: (await params).chatbotId,
    fieldType: FieldType.CustomField,
  })

  return NextResponse.json(allCustomFields)
}
