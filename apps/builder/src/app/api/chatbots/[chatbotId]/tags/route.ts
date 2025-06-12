import { auth } from "@/auth"
import { getTags } from "@/features/tags/queries"
import { getTagsSearchParamsCache } from "@/features/tags/schemas/get-tags-schema"
import { errorResponse } from "@/lib/error-handling"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params

    const session = await auth()
    await findChatbotOrFail(session?.user.id, chatbotId)

    const searchParams = getTagsSearchParamsCache.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    )
    const data = await getTags({
      chatbotId,
      ...searchParams,
    })

    return NextResponse.json(data)
  } catch (e) {
    return errorResponse(e)
  }
}
