import { describe, expect, test } from "vitest"
import { resolveEffectiveCallingSettings } from "../src/features/integration-whatsapp/calling/lib/effective-calling-settings"

const metaEnabled = {
  status: "ENABLED" as const,
  callback_permission_status: "ENABLED" as const,
}

describe("resolveEffectiveCallingSettings", () => {
  test("both switches on: Meta's settings pass through untouched", () => {
    expect(resolveEffectiveCallingSettings(metaEnabled, true)).toEqual(
      metaEnabled,
    )
  })

  // A number whose calls are refused must not render as "on" — the case that
  // showed the switch on while the call button said to go enable it.
  test.each([
    [null],
    [false],
  ])("workspace switch %s: shown as off even though Meta is on", (workspaceCallingEnabled) => {
    expect(
      resolveEffectiveCallingSettings(metaEnabled, workspaceCallingEnabled),
    ).toEqual({ ...metaEnabled, status: "DISABLED" })
  })

  test("Meta off stays off whatever the workspace says", () => {
    expect(
      resolveEffectiveCallingSettings({ status: "DISABLED" }, true),
    ).toEqual({ status: "DISABLED" })
  })
})
