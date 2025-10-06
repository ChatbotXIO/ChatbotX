import { type NextRequest, NextResponse } from "next/server"
import { getTags } from "@/features/tags/queries"
import { getTagsSearchParamsCache } from "@/features/tags/schemas/get-tags-schema"
import { getCurrentUserId } from "@/lib/auth"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { findChatbotOrFail } from "@/lib/user-permissions"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params

    const userId = await getCurrentUserId()
    await findChatbotOrFail(userId, chatbotId)

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
