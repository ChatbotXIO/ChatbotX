import { broadcastScheduleTypes } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  BROADCAST_SCHEDULE_TYPE_MESSAGE_KEY,
  buildBroadcastScheduleTypeOptions,
  resolveBroadcastScheduleTypeMessageKey,
} from "@/features/broadcasts/lib/schedule-type-options"
import messages from "../messages/en.json"

/** Resolves a dotted message key against the source locale. */
function readMessage(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, segment) =>
        node != null && typeof node === "object"
          ? (node as Record<string, unknown>)[segment]
          : undefined,
      messages,
    )
}

describe("broadcast schedule-type labels", () => {
  test("labels every schedule type the enum defines", () => {
    expect(Object.keys(BROADCAST_SCHEDULE_TYPE_MESSAGE_KEY).sort()).toEqual(
      [...broadcastScheduleTypes.options].sort(),
    )
  })

  test("resolves every label to a real key in the source locale", () => {
    // The bug this guards: `future` was labelled by interpolating the enum
    // value, producing the non-existent key `fields.schedule.future`, which
    // next-intl then rendered verbatim in the broadcast detail dialog.
    for (const key of Object.values(BROADCAST_SCHEDULE_TYPE_MESSAGE_KEY)) {
      expect(typeof readMessage(key)).toBe("string")
    }
  })

  test("maps future to the 'scheduled' key, not to its own enum value", () => {
    expect(BROADCAST_SCHEDULE_TYPE_MESSAGE_KEY.future).toBe(
      "fields.schedule.scheduled",
    )
    expect(readMessage("fields.schedule.future")).toBeUndefined()
  })

  test("resolves a persisted schedule type, which the model widens to string", () => {
    for (const value of broadcastScheduleTypes.options) {
      expect(resolveBroadcastScheduleTypeMessageKey(value)).toBe(
        BROADCAST_SCHEDULE_TYPE_MESSAGE_KEY[value],
      )
    }
  })

  test("falls back to the 'now' label for an unrecognised schedule type", () => {
    // Never present an unparseable row as "scheduled for later".
    expect(resolveBroadcastScheduleTypeMessageKey("")).toBe(
      "fields.schedule.now",
    )
    expect(resolveBroadcastScheduleTypeMessageKey("recurring")).toBe(
      "fields.schedule.now",
    )
  })

  test("builds one option per schedule type, in enum order", () => {
    const options = buildBroadcastScheduleTypeOptions((key) => `t:${key}`)

    expect(options).toEqual([
      { value: "now", label: "t:fields.schedule.now" },
      { value: "future", label: "t:fields.schedule.scheduled" },
    ])
    expect(options.map((option) => option.value)).toEqual(
      broadcastScheduleTypes.options,
    )
  })
})
