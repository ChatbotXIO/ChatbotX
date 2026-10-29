// @vitest-environment node

import { OpenAPIGenerator } from "@orpc/openapi"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { describe, expect, test, vi } from "vitest"
import {
  publicSpecGenerateOptions,
  withChannelApiTokenSecurity,
  withIdempotencyKeyHeader,
} from "@/lib/orpc/public-spec"
import {
  BASE_PUBLIC_SPEC_TITLE,
  buildBasePublicSpec,
  serializeBasePublicSpec,
} from "@/lib/orpc/public-spec-build"

// Same stubs as public-spec-operations.test.ts: `@/routers/public` reaches a
// real `pg.Pool` and the better-auth stack, neither of which a metadata-only
// test needs.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
  workspaceAuthorizedMidddleware: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy, sql: proxy }
})

const { publicRouter } = await import("@/routers/public")

// Drift guard: `/api/public-spec.json` serves this committed file. CI never
// writes snapshots, so changing a public procedure without regenerating
// (`pnpm --filter builder gen:public-spec`) fails here.
describe("public spec base snapshot", () => {
  test("src/generated/public-spec.base.json matches the generated spec", async () => {
    const spec = await buildBasePublicSpec(publicRouter)

    await expect(serializeBasePublicSpec(spec)).toMatchFileSnapshot(
      "../src/generated/public-spec.base.json",
    )
  })

  // The route filters the base spec's `paths` instead of asking oRPC to
  // filter while generating — these must stay equivalent.
  test.each([
    "contacts",
    "channels",
    "tags",
  ])("filtering the base spec by ?filter=%s equals generating with that filter", async (filter) => {
    const generator = new OpenAPIGenerator({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    })
    const generated = withIdempotencyKeyHeader(
      withChannelApiTokenSecurity(
        await generator.generate(publicRouter, {
          ...publicSpecGenerateOptions(BASE_PUBLIC_SPEC_TITLE),
          filter: ({ contract }) =>
            contract["~orpc"].route.path
              ? contract["~orpc"].route.path.startsWith(`/v1/${filter}`)
              : true,
        }),
      ),
    )

    const base = await buildBasePublicSpec(publicRouter)
    const filteredPaths = Object.fromEntries(
      Object.entries(base.paths ?? {}).filter(([path]) =>
        path.startsWith(`/v1/${filter}`),
      ),
    )

    expect(
      JSON.parse(JSON.stringify({ ...base, paths: filteredPaths })),
    ).toEqual(JSON.parse(JSON.stringify(generated)))
  })
})
