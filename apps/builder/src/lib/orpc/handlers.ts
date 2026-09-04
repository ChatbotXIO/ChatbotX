import { SmartCoercionPlugin } from "@orpc/json-schema"
import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins"
import { type AnyRouter, ORPCError, onError } from "@orpc/server"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { logger } from "@/lib/log"

const SPEC_VERSION = "0.0.1"

const SECURITY_SCHEMES = {
  bearerAuth: { type: "http", scheme: "bearer" },
  developerAccessToken: { type: "http", scheme: "bearer" },
  tokenInSearchParams: { type: "apiKey", in: "query", name: "token" },
} as const

const DOCS_AUTHENTICATION = {
  securitySchemes: {
    bearerAuth: { token: "default-token" },
    developerAccessToken: { token: "default-workspace-token" },
  },
}

const SERVER_ERROR_STATUS_THRESHOLD = 500

/**
 * Single place unknown/server errors get logged at error level for a route
 * handler. Known 4xx `ORPCError`s are already warn-logged by
 * `mapKnownOrpcErrors` (`@/orpc`) before reaching here, so this only logs an
 * `ORPCError` with status >= 500 or a non-ORPC error — each exactly once.
 * Returns a plain callback (not the `onError`-wrapped interceptor) so each
 * call site can pass it to `onError(...)` directly, where oRPC's handler
 * options give TypeScript the context it needs to infer the interceptor's
 * type — wrapping it here and returning the result loses that inference.
 */
export function logUnexpectedOrpcErrorCallback(label: string) {
  return (error: unknown) => {
    if (
      error instanceof ORPCError &&
      error.status < SERVER_ERROR_STATUS_THRESHOLD
    ) {
      return
    }

    logger.error({ err: error }, `Error in ${label}`)
  }
}

/**
 * One OpenAPI handler per REST surface (currently just `/api`, the public
 * router). Build it once per module — instantiating per request is
 * expensive (rebuilds plugins every call). `OpenAPIReferencePlugin` also
 * serves a Scalar docs page at `${prefix}/` and the spec at
 * `${prefix}/spec.json`, so no separate docs route is needed.
 */
export function createOpenAPIHandler<T extends AnyRouter>(
  router: T,
  options: { title: string; logLabel: string },
) {
  return new OpenAPIHandler(router, {
    interceptors: [onError(logUnexpectedOrpcErrorCallback(options.logLabel))],
    plugins: [
      new SmartCoercionPlugin({
        schemaConverters: [new ZodToJsonSchemaConverter()],
      }),
      new OpenAPIReferencePlugin({
        schemaConverters: [new ZodToJsonSchemaConverter()],
        specGenerateOptions: {
          info: { title: options.title, version: SPEC_VERSION },
          commonSchemas: {
            UndefinedError: { error: "UndefinedError" },
          },
          security: [
            { bearerAuth: [] },
            { developerAccessToken: [] },
            { tokenInSearchParams: [] },
          ],
          components: { securitySchemes: SECURITY_SCHEMES },
        },
        docsConfig: { authentication: DOCS_AUTHENTICATION },
      }),
    ],
  })
}
