import { type NextRequest, NextResponse } from "next/server"
import { updateAIAgentDefault } from "@/features/ai-agents/queries"
import { setDefaultAIAgentRequest } from "@/features/ai-agents/schemas/update.schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const data = await request.json()
    const parsedInput = setDefaultAIAgentRequest.parse(data)

    const { chatbotId } = await params
    await assertCurrentUserCanAccessChatbot(chatbotId)

    await updateAIAgentDefault(chatbotId, parsedInput)

    return NextResponse.json({})
  } catch (e) {
    return serverErrorHandler(e)
  }
}
