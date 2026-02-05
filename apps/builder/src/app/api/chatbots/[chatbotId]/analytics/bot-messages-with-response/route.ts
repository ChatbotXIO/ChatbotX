import { botMessageAnalyticsService } from "@aha.chat/analytics"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

const querySchema = z.object({
  from: z.string().transform((val) => new Date(val)),
  to: z.string().transform((val) => new Date(val)),
  granularity: z.enum(["minute", "hour", "day"]).default("day"),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const { chatbotId } = await params
    await assertCurrentUserCanAccessChatbot(chatbotId)

    const searchParams = querySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    )

    const timeRange = {
      from: searchParams.from,
      to: searchParams.to,
    }

    const data = await botMessageAnalyticsService.getMessagesWithResponse(
      chatbotId,
      timeRange,
      searchParams.granularity,
    )

    return NextResponse.json(data)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
