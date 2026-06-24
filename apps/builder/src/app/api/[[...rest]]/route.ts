import { SmartCoercionPlugin } from "@orpc/json-schema"
import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins"
import { onError } from "@orpc/server"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { logger } from "@/lib/log"
import { router } from "@/routers"
import "@/polyfill"

// Singleton handler — instantiating per request is expensive (rebuilds plugins every call).
const openAPIHandler = new OpenAPIHandler(router, {
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

export async function handleRequest(request: Request) {
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
