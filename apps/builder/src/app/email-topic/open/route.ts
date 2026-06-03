import { emailTopicAnalyticsService } from "@chatbotx.io/analytics"
import { NextResponse } from "next/server"

const GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get("r")
  if (token) {
    await emailTopicAnalyticsService.recordOpen(token)
  }

  return new NextResponse(GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
