import { getPublicOriginFromRequest } from "@chatbotx.io/utils"
import { OpenAPIGenerator } from "@orpc/openapi"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import "@/polyfill"
import { getTenantSettings } from "@/features/tenant/utils"
import {
  publicSpecGenerateOptions,
  withChannelApiTokenSecurity,
} from "@/lib/orpc/public-spec"
import { publicRouter } from "@/routers/public"

const openAPIGenerator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
})

async function handleRequest(request: Request) {
  const { name } = await getTenantSettings()

  const spec = await openAPIGenerator.generate(publicRouter, {
    ...publicSpecGenerateOptions(name),
    servers: [
      {
        url: new URL("/api", getPublicOriginFromRequest(request)).toString(),
      },
    ],
    filter: ({ contract }) => {
      const searchParams = new URL(request.url).searchParams
      const filter = searchParams.get("filter")

      if (filter && contract["~orpc"].route.path) {
        return contract["~orpc"].route.path.startsWith(`/v1/${filter}`)
      }
      return true
    },
  })

  const document = spec ? withChannelApiTokenSecurity(spec) : spec

  return document
    ? Response.json(document)
    : new Response("Not found", { status: 404 })
}

export const HEAD = handleRequest
export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest
