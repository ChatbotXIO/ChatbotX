import { type NextRequest, NextResponse } from "next/server"
import { listWorksheets } from "@/features/spreadsheets/queries/list-worksheet.qureies"
import { listWorksheetsRequest } from "@/features/spreadsheets/schemas/list-worksheets.request"
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
    const search = listWorksheetsRequest.parse({
      ...searchParams,
      chatbotId,
    })

    const worksheets = await listWorksheets(search)

    return NextResponse.json(worksheets)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
