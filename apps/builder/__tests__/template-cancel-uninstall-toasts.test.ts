// @vitest-environment node

import { describe, expect, test } from "vitest"
import { cancelUninstallToasts } from "../src/features/templates/lib/cancel-uninstall-toasts"

const t = (key: string, values?: { count: number }) =>
  values ? `${key}:${values.count}` : key

const none = {
  keptPartlyRemoved: 0,
  keptInactiveForReview: 0,
  keptHistoryRemoved: 0,
  alreadyCommitted: 0,
}

describe("cancelUninstallToasts", () => {
  test("a clean cancel is one success", () => {
    expect(cancelUninstallToasts(t, none)).toEqual([
      { level: "success", message: "templates.uninstall.cancelled" },
    ])
  })

  test("no data still reports the cancel", () => {
    expect(cancelUninstallToasts(t, undefined)).toEqual([
      { level: "success", message: "templates.uninstall.cancelled" },
    ])
  })

  test("each kept kind gets its own line, in order, before the outcome", () => {
    expect(
      cancelUninstallToasts(t, {
        keptPartlyRemoved: 1,
        keptInactiveForReview: 2,
        keptHistoryRemoved: 3,
        alreadyCommitted: 0,
      }),
    ).toEqual([
      { level: "info", message: "templates.uninstall.keptPartlyRemoved:1" },
      {
        level: "warning",
        message: "templates.uninstall.keptInactiveForReview:2",
      },
      { level: "info", message: "templates.uninstall.keptHistoryRemoved:3" },
      { level: "success", message: "templates.uninstall.cancelled" },
    ])
  })

  test("copies past the point of no return replace the success line", () => {
    expect(cancelUninstallToasts(t, { ...none, alreadyCommitted: 4 })).toEqual([
      { level: "info", message: "templates.uninstall.cancelledPartial:4" },
    ])
  })
})
