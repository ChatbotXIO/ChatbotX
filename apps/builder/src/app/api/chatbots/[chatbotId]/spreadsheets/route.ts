import { type NextRequest, NextResponse } from "next/server"
import { listSpreadsheets } from "@/features/spreadsheets/queries/list-spreadsheet.queries"
import { listSpreadsheetsRequest } from "@/features/spreadsheets/schemas/list-spreadsheets.request"
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
    const search = listSpreadsheetsRequest.parse({
      ...searchParams,
      chatbotId,
    })

    const allSpreadsheets = await listSpreadsheets(search)

    return NextResponse.json(allSpreadsheets)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
