import { type NextRequest, NextResponse } from "next/server"
import { getFolders } from "@/features/folders/queries"
import { listFoldersSearchParams } from "@/features/folders/schemas/query"
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
    const search = listFoldersSearchParams.parse(searchParams)

    const allFlows = await getFolders({
      ...search,
      chatbotId,
    })

    return NextResponse.json(allFlows)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
