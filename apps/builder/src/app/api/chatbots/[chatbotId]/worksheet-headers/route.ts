import { type NextRequest, NextResponse } from "next/server"
import { getWorkSheetHeaders } from "@/features/spreadsheets/queries"
import { getWorksheetHeaderSearchParams } from "@/features/spreadsheets/schemas"
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
    const search = getWorksheetHeaderSearchParams.parse(searchParams)

    const worksheets = await getWorkSheetHeaders({
      ...search,
      chatbotId: (await params).chatbotId,
    })

    return NextResponse.json(worksheets)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
