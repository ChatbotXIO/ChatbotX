import {
  type ContactEventType,
  contactAnalyticsService,
  shouldUseMonthlyGranularity,
} from "@aha.chat/analytics"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

const querySchema = z.object({
  from: z.string().transform((val) => new Date(val)),
  to: z.string().transform((val) => new Date(val)),
  granularity: z.enum(["minute", "hour", "day"]).default("day"),
  eventTypes: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(",") : undefined)),
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

    const shouldUseMonthly = shouldUseMonthlyGranularity(
      timeRange.from,
      timeRange.to,
    )

    const granularity = shouldUseMonthly ? "day" : searchParams.granularity

    let data: unknown
    switch (granularity) {
      case "minute":
        data = await contactAnalyticsService.getStatsByMinute(
          chatbotId,
          timeRange,
          searchParams.eventTypes as ContactEventType[] | undefined,
        )
        break
      case "hour":
        data = await contactAnalyticsService.getStatsByHour(
          chatbotId,
          timeRange,
          searchParams.eventTypes as ContactEventType[] | undefined,
        )
        break
      case "day":
        data = await contactAnalyticsService.getStatsByDay(
          chatbotId,
          timeRange,
          searchParams.eventTypes as ContactEventType[] | undefined,
        )
        break
      default:
        data = []
    }

    return NextResponse.json(data)
  } catch (e) {
    return serverErrorHandler(e)
  }
}
