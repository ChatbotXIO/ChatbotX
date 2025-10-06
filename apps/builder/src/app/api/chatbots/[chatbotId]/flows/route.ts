import { type NextRequest, NextResponse } from "next/server"
import { getFlows } from "@/features/flows/queries"
import { listFlowsSearchParams } from "@/features/flows/schemas/get-flows-schema"
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
    const search = listFlowsSearchParams.parse(searchParams)

    const allFlows = await getFlows({
      ...search,
      chatbotId: (await params).chatbotId,
    })

    return NextResponse.json(allFlows)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
