import { NextResponse } from "next/server"
import { getAIFunctions } from "@/features/ai-functions/queries"

export async function GET(
  _req: Request,
  { params }: { params: { chatbotId: string } },
) {
  try {
    const chatbotId = params.chatbotId
    const result = await getAIFunctions({ chatbotId })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { data: [], pageCount: 0, error: (error as Error).message },
      { status: 500 },
    )
  }
}
