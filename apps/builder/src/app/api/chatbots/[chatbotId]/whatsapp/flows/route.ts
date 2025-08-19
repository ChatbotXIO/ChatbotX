import { type NextRequest, NextResponse } from "next/server"
import { getWhatsappFlows } from "@/features/integration-whatsapp/flows/queries"
import { getWhatsappFlowsSearchParamsCache } from "@/features/integration-whatsapp/flows/schemas/get-flows-schema"
import { getCurrentUserId } from "@/lib/auth"
import { errorResponse } from "@/lib/error-handling"
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
    const search = getWhatsappFlowsSearchParamsCache.parse(searchParams)

    const allFlows = await getWhatsappFlows({
      ...search,
      chatbotId: (await params).chatbotId,
    })

    return NextResponse.json(allFlows)
  } catch (e) {
    return errorResponse(e)
  }
}
