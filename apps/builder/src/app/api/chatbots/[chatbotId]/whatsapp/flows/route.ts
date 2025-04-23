import { getFlows } from "@/features/integration-whatsapp/flows/queries"
import { getFlowsSearchParamsCache } from "@/features/integration-whatsapp/flows/schemas/get-flows-schema"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  const searchParams = Object.fromEntries(req.nextUrl.searchParams)
  const search = getFlowsSearchParamsCache.parse(searchParams)

  const allFlows = await getFlows({
    ...search,
    chatbotId: (await params).chatbotId,
  })

  return NextResponse.json(allFlows)
}
