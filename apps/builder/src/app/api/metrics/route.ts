import { timingSafeEqual } from "node:crypto"
import {
  ensureDefaultMetrics,
  getMetrics,
  getMetricsContentType,
} from "@chatbotx.io/observability"
import { NextResponse } from "next/server"

const isAuthorized = (authorization: string | null, token: string): boolean => {
  if (!authorization?.startsWith("Bearer ")) {
    return false
  }

  const received = Buffer.from(authorization.slice("Bearer ".length))
  const expected = Buffer.from(token)
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  )
}

export async function GET(request: Request): Promise<Response> {
  const token = process.env.METRICS_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: "Metrics endpoint is disabled" },
      { status: 503 },
    )
  }

  if (!isAuthorized(request.headers.get("authorization"), token)) {
    return new Response(null, {
      status: 401,
      headers: { "www-authenticate": "Bearer" },
    })
  }

  ensureDefaultMetrics()

  return new Response(await getMetrics(), {
    status: 200,
    headers: { "content-type": getMetricsContentType() },
  })
}
