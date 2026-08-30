import { SmartCoercionPlugin } from "@orpc/json-schema"
import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins"
import { onError } from "@orpc/server"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { logger } from "@/lib/log"
import { publicRouter } from "@/routers/public"
import "@/polyfill"

// Singleton handler — instantiating per request is expensive (rebuilds plugins every call).
// Runtime boundary intentionally matches the spec boundary: this handler only
// ever serves `publicRouter` (workspace-token / channel-token auth), the same
// router `public-spec.json` documents. Private, session-authed procedures
// live on `/rpc` (see app/rpc/[[...rest]]/route.ts) and must never be
// reachable here — a procedure absent from publicRouter now 404s instead of
// silently answering to a session cookie. See __tests__/public-router-boundary.test.ts.
const openAPIHandler = new OpenAPIHandler(publicRouter, {
  interceptors: [
    // Log the real error before oRPC masks undefined errors as a generic 500.
    onError((error) => {
      logger.error(
        { err: error, cause: JSON.stringify((error as Error)?.cause) },
        "Error in OpenAPI handler",
      )
    }),
  ],
  plugins: [
    new SmartCoercionPlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
      specGenerateOptions: {
        info: {
          title: "ChatbotX",
          version: "0.0.1",
        },
        commonSchemas: {
          UndefinedError: { error: "UndefinedError" },
        },
        security: [
          { bearerAuth: [] },
          { developerAccessToken: [] },
          { tokenInSearchParams: [] },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
            },
            developerAccessToken: {
              type: "http",
              scheme: "bearer",
            },
            tokenInSearchParams: {
              type: "apiKey",
              in: "query",
              name: "token",
            },
          },
        },
      },
      docsConfig: {
        authentication: {
          securitySchemes: {
            bearerAuth: {
              token: "default-token",
            },
            developerAccessToken: {
              token: "default-workspace-token",
            },
          },
        },
      },
    }),
  ],
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
