import { OpenAPIGenerator } from "@orpc/openapi"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import {
  publicSpecGenerateOptions,
  withChannelApiTokenSecurity,
  withIdempotencyKeyHeader,
} from "./public-spec"

// Fixed title baked into the committed base spec; the route swaps in the
// tenant's name at request time.
export const BASE_PUBLIC_SPEC_TITLE = "Public API"

const openAPIGenerator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
})

/**
 * Generates the tenant/origin-independent public spec: security + idempotency
 * post-processing applied, placeholder title, no `servers`, no filter. Only
 * the snapshot test calls this (it needs the whole router); the route reads
 * the committed JSON instead so it never imports `publicRouter`.
 */
export async function buildBasePublicSpec(
  router: Parameters<OpenAPIGenerator["generate"]>[0],
) {
  const spec = await openAPIGenerator.generate(
    router,
    publicSpecGenerateOptions(BASE_PUBLIC_SPEC_TITLE),
  )
  return withIdempotencyKeyHeader(withChannelApiTokenSecurity(spec))
}

/**
 * Serializes the base spec compactly (the indented form is ~3x larger), but
 * with one top-level key and one path per line so a change to one operation
 * stays a one-line diff.
 */
export function serializeBasePublicSpec(
  spec: Awaited<ReturnType<typeof buildBasePublicSpec>>,
): string {
  const { paths = {}, ...rest } = spec
  const lines = Object.entries(rest).map(
    ([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`,
  )
  const pathLines = Object.entries(paths).map(
    ([path, item]) => `${JSON.stringify(path)}:${JSON.stringify(item)}`,
  )
  return `{\n${[...lines, `"paths":{\n${pathLines.join(",\n")}\n}`].join(",\n")}\n}\n`
}
