import { createOpenAPIHandler } from "@/lib/orpc/handlers"
import { publicRouter } from "@/routers/public"
import "@/polyfill"

// Runtime boundary intentionally matches the spec boundary: this handler
// only ever serves `publicRouter` (workspace-token / channel-token auth),
// the same router `public-spec.json` documents. Private, session-authed
// procedures live on the full router only, mirrored dev-only at
// /api-internal (see app/api-internal/[[...rest]]/route.ts) — a procedure
// absent from publicRouter now 404s instead of silently answering to a
// session cookie. See __tests__/public-router-boundary.test.ts.
const openAPIHandler = createOpenAPIHandler(publicRouter, {
  title: "ChatbotX",
  logLabel: "OpenAPI handler",
})

async function handleRequest(request: Request) {
  const { response } = await openAPIHandler.handle(request, {
    prefix: "/api",
    context: { headers: request.headers, url: request.url },
  })
  return response ?? new Response("Not found", { status: 404 })
}

export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest
