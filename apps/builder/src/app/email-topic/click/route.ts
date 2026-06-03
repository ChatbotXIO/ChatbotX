import { emailTopicAnalyticsService } from "@chatbotx.io/analytics"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get("r")
  const url = searchParams.get("url")

  if (token) {
    await emailTopicAnalyticsService.recordClick(token)
  }

  return NextResponse.redirect(url ?? request.url, { status: 302 })
}
