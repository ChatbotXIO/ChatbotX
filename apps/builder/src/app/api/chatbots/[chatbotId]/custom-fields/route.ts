import { type NextRequest, NextResponse } from "next/server"
import { listCustomFields } from "@/features/custom-fields/queries"
import { listCustomFieldsSearchParams } from "@/features/custom-fields/schemas/list-custom-fields.schema"
import { getCurrentUserId } from "@/lib/auth"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { findChatbotOrFail } from "@/lib/user-permissions"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params

    const userId = await getCurrentUserId()
    await findChatbotOrFail(userId, chatbotId)

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
