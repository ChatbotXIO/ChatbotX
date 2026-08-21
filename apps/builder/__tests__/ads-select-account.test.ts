import { describe, expect, test } from "vitest"
import { resolveSelectedIntegration } from "@/features/ads/lib/select-account"

const integrations = [
  { id: "wa-1", name: "Primary" },
  { id: "wa-2", name: "Secondary" },
] as const

describe("resolveSelectedIntegration", () => {
  test("returns the matching integration when the account param matches", () => {
    expect(resolveSelectedIntegration(integrations, "wa-2")).toBe(
      integrations[1],
    )
  })

  test("returns the first integration when the account param is unknown", () => {
    expect(resolveSelectedIntegration(integrations, "missing")).toBe(
      integrations[0],
    )
  })

  test("returns the first integration when the account param is empty", () => {
    expect(resolveSelectedIntegration(integrations, "")).toBe(integrations[0])
  })

  test("returns null when the integration list is empty", () => {
    expect(resolveSelectedIntegration([], "wa-1")).toBeNull()
  })
})
