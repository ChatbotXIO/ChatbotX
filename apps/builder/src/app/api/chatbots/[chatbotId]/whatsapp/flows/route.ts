import { auth } from "@/auth"
import { errorResponse } from "@/lib/error-handling"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { getWhatsappFlows } from "@/features/integration-whatsapp/flows/queries"
import { getWhatsappFlowsSearchParamsCache } from "@/features/integration-whatsapp/flows/schemas/get-flows-schema"
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
