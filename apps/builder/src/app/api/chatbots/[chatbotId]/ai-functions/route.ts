import { type NextRequest, NextResponse } from "next/server"
import { listAIFunctions } from "@/features/ai-functions/queries"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params
    await assertCurrentUserCanAccessChatbot(chatbotId)

    const result = await listAIFunctions({ chatbotId })
    return NextResponse.json(result)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
