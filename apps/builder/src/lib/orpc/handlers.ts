import { SmartCoercionPlugin } from "@orpc/json-schema"
import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins"
import { type AnyRouter, ORPCError, onError } from "@orpc/server"
import type { StandardHandleResult } from "@orpc/server/standard"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { logger } from "@/lib/log"
import { publicSpecGenerateOptions } from "./public-spec"

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
 * Request-level timing — logs every request through this handler (not
 * sampled: this is cheap and the sole in-process latency signal today, see
 * the plan's C0 measurement step). Registered as a plain `interceptors` entry
 * (not `onFinish`, which only observes the end of the call) so the timer
 * starts before `next()` runs the rest of the pipeline — auth middleware,
 * rate limiting, and the handler itself all fall inside the measured
 * duration. `matched: false` (no route matched — a 404) still logs, with
 * `status` omitted since there is no `StandardResponse` to read one from.
 * Narrowly typed to just the fields used (method/url/next) rather than the
 * full `StandardHandlerInterceptorOptions<TContext>` generic — that type
 * lives on `@orpc/server`'s `Interceptor<...>` wrapper (from `@orpc/shared`,
 * a transitive, undeclared dependency here), and oRPC still structurally
 * accepts this narrower shape wherever `OpenAPIHandler`'s `interceptors`
 * array expects one.
 */
export function createTimingInterceptor(label: string) {
  return async (options: {
    request: { method: string; url: URL }
    next(): Promise<StandardHandleResult>
  }): Promise<StandardHandleResult> => {
    const startedAtMs = Date.now()
    const result = await options.next()
    const durationMs = Date.now() - startedAtMs
    logger.info(
      {
        label,
        method: options.request.method,
        path: options.request.url.pathname,
        status: result.matched ? result.response.status : undefined,
        durationMs,
      },
      "oRPC request",
    )
    return result
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
    interceptors: [
      createTimingInterceptor(options.logLabel),
      onError(logUnexpectedOrpcErrorCallback(options.logLabel)),
    ],
    plugins: [
      new SmartCoercionPlugin({
        schemaConverters: [new ZodToJsonSchemaConverter()],
      }),
      new OpenAPIReferencePlugin({
        schemaConverters: [new ZodToJsonSchemaConverter()],
        specGenerateOptions: publicSpecGenerateOptions(options.title),
        docsConfig: { authentication: DOCS_AUTHENTICATION },
      }),
    ],
  })
}
