import { type NextRequest, NextResponse } from "next/server"
import { getSpreadSheets } from "@/features/spreadsheets/queries"
import { getWorksheetHeaderSearchParams } from "@/features/spreadsheets/schemas"
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
    const search = getWorksheetHeaderSearchParams.parse(searchParams)

    const allSpreadsheets = await getSpreadSheets({
      ...search,
      page: null,
      perPage: null,
      chatbotId: (await params).chatbotId,
    })

    return NextResponse.json(allSpreadsheets)
  } catch (e) {
    return errorResponse(e)
  }
}
