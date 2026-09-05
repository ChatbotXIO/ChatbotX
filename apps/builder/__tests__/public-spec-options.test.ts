// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  CHANNEL_API_TOKEN_SCHEME,
  PUBLIC_SECURITY_SCHEMES,
  publicSpecGenerateOptions,
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
