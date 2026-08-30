import { SmartCoercionPlugin } from "@orpc/json-schema"
import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins"
import { onError } from "@orpc/server"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { NextResponse } from "next/server"
import { logger } from "@/lib/log"
import { router } from "@/routers"
import "@/polyfill"

// Dev-only mirror of the old /api/[[...rest]] behavior: serves the FULL
// router (every private, session-authed procedure included) for local
// debugging via Scalar. Never reachable in production — the public runtime
// boundary at /api/[[...rest]] intentionally only serves `publicRouter`.
const openAPIHandler = new OpenAPIHandler(router, {
  interceptors: [
    onError((error) => {
      logger.error(
        { err: error, cause: JSON.stringify((error as Error)?.cause) },
        "Error in internal OpenAPI handler",
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
          title: "ChatbotX (internal, full router)",
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
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
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
