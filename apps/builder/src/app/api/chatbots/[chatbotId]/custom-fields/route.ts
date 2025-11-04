import { type NextRequest, NextResponse } from "next/server"
import { listCustomFields } from "@/features/custom-fields/queries"
import { listCustomFieldsSearchParams } from "@/features/custom-fields/schemas/list-custom-fields.schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params
    await assertCurrentUserCanAccessChatbot(chatbotId)

    const searchParams = Object.fromEntries(req.nextUrl.searchParams)
    const search = listCustomFieldsSearchParams.parse(searchParams)

    const allCustomFields = await listCustomFields({
      ...search,
      chatbotId: (await params).chatbotId,
    })

    return NextResponse.json(allCustomFields)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
