import { type NextRequest, NextResponse } from "next/server"
import { getAIFiles } from "@/features/ai-files/queries"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params
    const result = await getAIFiles({ chatbotId })
    return NextResponse.json(result)
  } catch (error) {
    return serverErrorHandler(error)
  }
}
