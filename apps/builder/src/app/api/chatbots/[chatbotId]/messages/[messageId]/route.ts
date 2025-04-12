import { findMessage } from "@/features/messages/queries/list-messages.query"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string; chatbotId: string }> },
) {
  const { chatbotId, messageId } = await params

  const result = await findMessage({ id: messageId, chatbotId })

  return NextResponse.json(result)
}
