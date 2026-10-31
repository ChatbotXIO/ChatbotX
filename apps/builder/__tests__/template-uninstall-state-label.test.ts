// @vitest-environment node

import { describe, expect, test } from "vitest"
import { uninstallStateLabelKey } from "../src/features/templates/components/uninstall-state"

describe("uninstallStateLabelKey", () => {
  test("names the states a person has to act on or wait for", () => {
    for (const state of [
      "pending",
      "running",
      "partial",
      "failed",
      "skipped",
    ] as const) {
      expect(uninstallStateLabelKey(state)).toBe(
        `templates.uninstall.state.${state}`,
      )
    }
  })

  test("has no label for an installation that is not being uninstalled or is done", () => {
    expect(uninstallStateLabelKey("none")).toBeNull()
    expect(uninstallStateLabelKey("done")).toBeNull()
  })
})
