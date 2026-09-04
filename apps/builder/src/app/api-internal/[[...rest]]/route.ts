import { createOpenAPIHandler } from "@/lib/orpc/handlers"
import { router } from "@/routers"
import "@/polyfill"

// Dev-only mirror of the old /api/[[...rest]] behavior: serves the FULL
// router (every private, session-authed procedure included) for local
// debugging via Scalar. Never reachable outside development — the public
// runtime boundary at /api/[[...rest]] intentionally only serves
// `publicRouter`.
const openAPIHandler = createOpenAPIHandler(router, {
  title: "ChatbotX (internal, full router)",
  logLabel: "internal OpenAPI handler",
})

async function handleRequest(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 })
  }

  const { response } = await openAPIHandler.handle(request, {
    prefix: "/api-internal",
    context: { headers: request.headers, url: request.url },
  })
  return response ?? new Response("Not found", { status: 404 })
}

export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest
