import { checkReadiness } from "@chatbotx.io/business/health"
import { NextResponse } from "next/server"

// Probed by the external status-page monitor. Unauthenticated: it exposes only
// two booleans. The liveness route (`/api/health`) stays dependency-free for
// the Docker health check.
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  const { db, redis } = await checkReadiness()
  return NextResponse.json(
    { db, redis },
    {
      status: db && redis ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  )
}
