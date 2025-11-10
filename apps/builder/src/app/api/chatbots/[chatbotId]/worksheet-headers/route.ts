import { type NextRequest, NextResponse } from "next/server"
import { listWorksheetHeaders } from "@/features/spreadsheets/queries/list-worksheet.qureies"
import { listWorksheetHeadersRequest } from "@/features/spreadsheets/schemas/list-worksheets.request"
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
    const search = listWorksheetHeadersRequest.parse({
      ...searchParams,
      chatbotId,
    })

    const headers = await listWorksheetHeaders(search)

    return NextResponse.json(headers)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
