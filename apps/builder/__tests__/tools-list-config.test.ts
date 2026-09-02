import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { buildMessagingAdsToolPath } from "@/features/ads-campaign/lib/tool-path"
import { canShowTool, TOOLS_CONFIG } from "@/features/tools/tools-list"

/**
 * The `permissions` jsonb column defaults to `{}` at runtime even though
 * `WorkspaceMemberPermissions` declares every flag required — `canShowTool`
 * (via `hasWorkspacePermission`) must fail closed on a partial object. Cast
 * through the real type (not `any`) so these tests exercise that runtime
 * shape without weakening type safety elsewhere.
 */
const permissions = (
  value: Partial<WorkspaceMemberPermissions>,
): WorkspaceMemberPermissions => value as WorkspaceMemberPermissions

describe("TOOLS_CONFIG — click-to-message-ads entry", () => {
  test("exists in the config", () => {
    const entry = TOOLS_CONFIG.find(
      (config) => config.id === "click-to-message-ads",
    )

    expect(entry).toBeDefined()
  })

  test("sits immediately after facebook-lead-ads", () => {
    const leadAdsIndex = TOOLS_CONFIG.findIndex(
      (config) => config.id === "facebook-lead-ads",
    )
    const clickToMessageAdsIndex = TOOLS_CONFIG.findIndex(
      (config) => config.id === "click-to-message-ads",
    )

    expect(clickToMessageAdsIndex).toBe(leadAdsIndex + 1)
  })

  test("has permission: superAdmin", () => {
    const entry = TOOLS_CONFIG.find(
      (config) => config.id === "click-to-message-ads",
    )

    expect(entry && "permission" in entry ? entry.permission : undefined).toBe(
      "superAdmin",
    )
  })

  test("has labelKey and descriptionKey under clickToMessageAds.*", () => {
    const entry = TOOLS_CONFIG.find(
      (config) => config.id === "click-to-message-ads",
    )

    expect(entry?.labelKey).toBe("clickToMessageAds.title")
    expect(entry?.descriptionKey).toBe("clickToMessageAds.description")
  })

  test("getLink(workspaceId) equals buildMessagingAdsToolPath({ workspaceId })", () => {
    const entry = TOOLS_CONFIG.find(
      (config) => config.id === "click-to-message-ads",
    )

    expect(entry?.getLink("ws_1")).toBe(
      buildMessagingAdsToolPath({ workspaceId: "ws_1" }),
    )
  })
})

describe("TOOLS_CONFIG — permission gating", () => {
  test("no entry other than click-to-message-ads declares a permission", () => {
    const gatedEntries = TOOLS_CONFIG.filter(
      (config) => "permission" in config,
    ).map((config) => config.id)

    expect(gatedEntries).toEqual(["click-to-message-ads"])
  })
})

describe("canShowTool", () => {
  test("is visible when the entry declares no permission", () => {
    expect(canShowTool(undefined, permissions({}))).toBe(true)
  })

  test("is visible for a superAdmin permission when permissions.superAdmin is true", () => {
    expect(canShowTool("superAdmin", permissions({ superAdmin: true }))).toBe(
      true,
    )
  })

  test("is hidden for a superAdmin permission when permissions.superAdmin is false", () => {
    expect(canShowTool("superAdmin", permissions({ superAdmin: false }))).toBe(
      false,
    )
  })

  test("is hidden (fail-closed) for a superAdmin permission when permissions is an empty partial object", () => {
    expect(canShowTool("superAdmin", permissions({}))).toBe(false)
  })
})
