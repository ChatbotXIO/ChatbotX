import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { z } from "zod"

/**
 * Mirrors the `flow` enum in
 * `apps/builder/src/app/integrations/[...integration]/callback.ts`. That module
 * cannot be imported here — it pulls in `next/headers` and the whole business
 * layer — so this test pins the contract the connect action and the callback
 * must agree on. Keep the literal list below in sync with the route.
 */
const flowSchema = z
  .enum([
    "facebookAds",
    "facebookLeadAds",
    "metaCatalog",
    "messagingAds",
    "facebookMarketingMessages",
  ])
  .optional()

describe("OAuth state flow enum", () => {
  test("accepts the marketing messages flow", () => {
    expect(flowSchema.safeParse("facebookMarketingMessages").success).toBe(true)
  })

  test("still accepts every pre-existing flow", () => {
    for (const flow of [
      "facebookAds",
      "facebookLeadAds",
      "metaCatalog",
      "messagingAds",
    ]) {
      expect(flowSchema.safeParse(flow).success).toBe(true)
    }
  })

  test("rejects an unknown flow", () => {
    expect(flowSchema.safeParse("somethingElse").success).toBe(false)
  })
})

describe("callback route", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/integrations/[...integration]/callback.ts"),
    "utf8",
  )

  test("declares the marketing messages flow in the state schema", () => {
    expect(source).toContain('"facebookMarketingMessages"')
  })

  test("dispatches the marketing messages branch", () => {
    expect(source).toContain('stateParams.flow === "facebookMarketingMessages"')
  })

  test("stores the grant inside an audit context", () => {
    const branchIndex = source.indexOf(
      'stateParams.flow === "facebookMarketingMessages"',
    )
    const branch = source.slice(branchIndex, branchIndex + 800)

    expect(branch).toContain("withAuditContext")
  })
})
