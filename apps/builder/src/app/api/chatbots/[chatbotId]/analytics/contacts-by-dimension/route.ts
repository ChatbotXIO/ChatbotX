import { contactAnalyticsService } from "@aha.chat/analytics"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { serverErrorHandler } from "@/lib/errors/server-handler"

const querySchema = z.object({
  from: z.string().transform((val) => new Date(val)),
  to: z.string().transform((val) => new Date(val)),
  timezone: z.string().default("UTC"),
  dimension: z.enum(["country", "channel", "source"]).default("channel"),
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

    let data: unknown
    switch (searchParams.dimension) {
      case "country":
        data = await contactAnalyticsService.getContactsByCountry(
          chatbotId,
          timeRange,
          searchParams.timezone,
        )
        break
      case "channel":
        data = await contactAnalyticsService.getContactsByChannel(
          chatbotId,
          timeRange,
          searchParams.timezone,
        )
        break
      case "source":
        data = await contactAnalyticsService.getContactsBySource(
          chatbotId,
          timeRange,
          searchParams.timezone,
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
