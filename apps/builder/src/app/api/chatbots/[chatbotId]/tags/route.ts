import { type NextRequest, NextResponse } from "next/server"
import { getTags } from "@/features/tags/queries"
import { getTagsSearchParamsCache } from "@/features/tags/schemas/get-tags-schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params
    await assertCurrentUserCanAccessChatbot(chatbotId)

    const searchParams = getTagsSearchParamsCache.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    )
    const data = await getTags({
      chatbotId,
      ...searchParams,
    })

    return NextResponse.json(data)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
