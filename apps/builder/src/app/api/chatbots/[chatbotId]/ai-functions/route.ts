import { type NextRequest, NextResponse } from "next/server"
import { getAIFunctions } from "@/features/ai-functions/queries"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params
    const result = await getAIFunctions({ chatbotId })
    return NextResponse.json(result)
  } catch (error) {
    return serverErrorHandler(error)
  }
}
