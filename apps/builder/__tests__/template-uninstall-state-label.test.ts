// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  uninstallActionLabelKey,
  uninstallStateLabelKey,
} from "../src/features/templates/components/uninstall-state"

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

describe("uninstallActionLabelKey", () => {
  test("says in progress while an uninstall is queued or running", () => {
    for (const state of ["pending", "running"] as const) {
      expect(uninstallActionLabelKey(state)).toBe(
        "templates.uninstall.inProgress",
      )
    }
  })

  test("offers a retry for a finished-but-incomplete uninstall", () => {
    for (const state of ["partial", "failed", "skipped"] as const) {
      expect(uninstallActionLabelKey(state)).toBe("templates.uninstall.retry")
    }
  })

  test("is the plain action otherwise", () => {
    for (const state of [undefined, "none", "done"] as const) {
      expect(uninstallActionLabelKey(state)).toBe("templates.uninstall.action")
    }
  })
})
