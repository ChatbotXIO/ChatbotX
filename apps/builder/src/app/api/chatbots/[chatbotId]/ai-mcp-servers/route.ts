import { type NextRequest, NextResponse } from "next/server"
import { getAIMcpServers } from "@/features/ai-mcp-servers/queries"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params
    await assertCurrentUserCanAccessChatbot(chatbotId)

    const result = await getAIMcpServers({ chatbotId })
    return NextResponse.json(result)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
