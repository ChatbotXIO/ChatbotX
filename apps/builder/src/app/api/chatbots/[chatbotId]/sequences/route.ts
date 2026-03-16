import { type NextRequest, NextResponse } from "next/server"
import { listSequences } from "@/features/sequences/queries"
import { getSequencesSearchParamsCache } from "@/features/sequences/schemas/get-sequences-schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params
    await assertCurrentUserCanAccessChatbot(chatbotId)

    const search = getSequencesSearchParamsCache.parse(
      Object.fromEntries(req.nextUrl.searchParams),
    )

    const result = await listSequences({
      ...search,
      chatbotId,
    })

    return NextResponse.json(result)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
