import { auth } from "@/auth"
import { getFlows } from "@/features/flows/queries"
import { listFlowsSearchParams } from "@/features/flows/schemas/get-flows-schema"
import { errorResponse } from "@/lib/error-handling"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params

    const session = await auth()
    await findChatbotOrFail(session?.user.id, chatbotId)

    const searchParams = Object.fromEntries(req.nextUrl.searchParams)
    const search = listFlowsSearchParams.parse(searchParams)

    const allFlows = await getFlows({
      ...search,
      chatbotId: (await params).chatbotId,
    })

    return NextResponse.json(allFlows)
  } catch (e) {
    return errorResponse(e)
  }
}
