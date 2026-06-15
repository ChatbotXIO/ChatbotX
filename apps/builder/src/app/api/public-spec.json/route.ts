import { getPublicOriginFromRequest } from "@chatbotx.io/utils"
import { OpenAPIGenerator } from "@orpc/openapi"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import "@/polyfill"
import { getTenantSettings } from "@/features/tenant/utils"
import { publicRouter } from "@/routers/public"

const openAPIGenerator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
})

async function handleRequest(request: Request) {
  const { name } = await getTenantSettings()

  const spec = await openAPIGenerator.generate(publicRouter, {
    info: {
      title: name,
      version: "0.0.1",
    },

    commonSchemas: {
      UndefinedError: { error: "UndefinedError" },
    },
    security: [{ developerAccessToken: [] }, { tokenInSearchParams: [] }],
    components: {
      securitySchemes: {
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
    servers: [
      {
        url: new URL("/api", getPublicOriginFromRequest(request)).toString(),
      },
    ],
    filter: ({ contract }) => {
      const searchParams = new URLSearchParams(request.url.split("?")[1])
      const filter = searchParams.get("filter")

      if (filter && contract["~orpc"].route.path) {
        return contract["~orpc"].route.path.startsWith(`/v1/${filter}`)
      }
      return true
    },
  })

  return spec ? Response.json(spec) : new Response("Not found", { status: 404 })
}

export const HEAD = handleRequest
export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest
