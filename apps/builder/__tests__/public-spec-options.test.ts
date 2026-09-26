// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  CHANNEL_API_TOKEN_SCHEME,
  PUBLIC_SECURITY_SCHEMES,
  publicSpecGenerateOptions,
  withIdempotencyKeyHeader,
} from "../src/lib/orpc/public-spec"

describe("publicSpecGenerateOptions", () => {
  test("declares all four security schemes", () => {
    expect(Object.keys(PUBLIC_SECURITY_SCHEMES).sort()).toEqual(
      [
        "bearerAuth",
        "developerAccessToken",
        "tokenInSearchParams",
        CHANNEL_API_TOKEN_SCHEME,
      ].sort(),
    )
  })

  test("document-level security lists only workspace-token schemes", () => {
    const options = publicSpecGenerateOptions("test")

    expect(options.security).toEqual([
      { bearerAuth: [] },
      { developerAccessToken: [] },
      { tokenInSearchParams: [] },
    ])

    for (const requirement of options.security) {
      expect(Object.keys(requirement)).not.toContain(CHANNEL_API_TOKEN_SCHEME)
    }
  })

  test("components.securitySchemes matches PUBLIC_SECURITY_SCHEMES", () => {
    const options = publicSpecGenerateOptions("test")

    expect(options.components.securitySchemes).toBe(PUBLIC_SECURITY_SCHEMES)
  })
})

describe("withIdempotencyKeyHeader", () => {
  test("adds the header to write operations without changing reads or duplicating parameters", () => {
    const spec = {
      paths: {
        "/v1/resources": {
          delete: { responses: {}, parameters: [{ name: "id", in: "query" }] },
          get: { responses: {} },
          patch: { responses: {} },
          post: { responses: {} },
          put: { responses: {} },
        },
      },
    } as unknown as Parameters<typeof withIdempotencyKeyHeader>[0]

    withIdempotencyKeyHeader(spec)
    withIdempotencyKeyHeader(spec)

    const operations = spec.paths?.["/v1/resources"] as
      | Record<string, { parameters?: Array<{ name?: string; in?: string }> }>
      | undefined
    expect(operations?.get?.parameters).toBeUndefined()
    for (const method of ["post", "put", "patch", "delete"] as const) {
      const parameters = operations?.[method]?.parameters ?? []
      expect(
        parameters.filter((parameter) => parameter.name === "Idempotency-Key"),
      ).toHaveLength(1)
    }
    expect(operations?.delete?.parameters).toContainEqual({
      name: "id",
      in: "query",
    })
  })
})
