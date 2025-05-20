import { type NextRequest, NextResponse } from "next/server"
import { getWorkSheets } from "@/features/spreadsheets/queries"
import { getWorksheetSearchParams } from "@/features/spreadsheets/schemas"
import { getCurrentUserId } from "@/lib/auth"
import { errorResponse } from "@/lib/error-handling"
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
    const search = getWorksheetSearchParams.parse(searchParams)

    const worksheets = await getWorkSheets({
      ...search,
      chatbotId: (await params).chatbotId,
    })

    return NextResponse.json(worksheets)
  } catch (e) {
    return errorResponse(e)
  }
}
