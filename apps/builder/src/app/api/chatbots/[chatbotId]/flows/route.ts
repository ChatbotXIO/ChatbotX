import { getFlows } from "@/features/flows/queries"
import { listFlowsSearchParams } from "@/features/flows/schemas/get-flows-schema"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  const searchParams = Object.fromEntries(req.nextUrl.searchParams)
  const search = listFlowsSearchParams.parse(searchParams)

  const allFlows = await getFlows({
    ...search,
    chatbotId: (await params).chatbotId,
  })

  return NextResponse.json(allFlows)
}
