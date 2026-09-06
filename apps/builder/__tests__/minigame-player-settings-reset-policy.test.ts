// @vitest-environment node

import { describe, expect, test } from "vitest"
import { buildPlayerSettingsForResetPolicy } from "@/features/minigames/lib/player-settings"

const configured = {
  drawsPerPerson: 5,
  maxSharesPerPerson: 7,
  sharingFlowId: "flow-1",
  sharingNodeId: "node-1",
  resetPolicy: "never",
} as const

describe("buildPlayerSettingsForResetPolicy", () => {
  // The whole point of this helper: a dropped field here is invisible to
  // typecheck and would silently switch sharing off, killing every share link
  // already in circulation.
  test("carries every shared field across a policy switch, both ways", () => {
    const toEveryNDays = buildPlayerSettingsForResetPolicy(
      configured,
      "everyNDays",
    )
    expect(toEveryNDays).toEqual({
      drawsPerPerson: 5,
      maxSharesPerPerson: 7,
      sharingFlowId: "flow-1",
      sharingNodeId: "node-1",
      resetPolicy: "everyNDays",
      resetIntervalDays: 1,
    })

    expect(buildPlayerSettingsForResetPolicy(toEveryNDays, "never")).toEqual({
      drawsPerPerson: 5,
      maxSharesPerPerson: 7,
      sharingFlowId: "flow-1",
      sharingNodeId: "node-1",
      resetPolicy: "never",
    })
  })

  test("survives a round trip without losing the sharing node", () => {
    const roundTripped = buildPlayerSettingsForResetPolicy(
      buildPlayerSettingsForResetPolicy(configured, "everyNDays"),
      "never",
    )

    expect(roundTripped).toEqual(configured)
  })

  test("keeps an already-chosen reset interval instead of resetting it to 1", () => {
    const everyThreeDays = {
      ...configured,
      resetPolicy: "everyNDays",
      resetIntervalDays: 3,
    } as const

    expect(
      buildPlayerSettingsForResetPolicy(everyThreeDays, "everyNDays"),
    ).toMatchObject({ resetIntervalDays: 3 })
  })

  // Legacy jsonb rows have none of these keys.
  test("falls back to safe defaults for a value with no fields set", () => {
    expect(buildPlayerSettingsForResetPolicy(undefined, "never")).toEqual({
      drawsPerPerson: 1,
      maxSharesPerPerson: 0,
      sharingFlowId: null,
      sharingNodeId: null,
      resetPolicy: "never",
    })
  })
})
