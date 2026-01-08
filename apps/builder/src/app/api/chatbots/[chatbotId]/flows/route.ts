import { type NextRequest, NextResponse } from "next/server"
import { getFlows } from "@/features/flows/queries"
import { listFlowsSearchParams } from "@/features/flows/schemas/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ chatbotId: string }>
  },
) {
  try {
    const { chatbotId } = await params
    await assertCurrentUserCanAccessChatbot(chatbotId)

    const searchParams = Object.fromEntries(req.nextUrl.searchParams)
    const search = listFlowsSearchParams.parse(searchParams)

    const allFlows = await getFlows({
      ...search,
      chatbotId,
    })

    return NextResponse.json(allFlows)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
