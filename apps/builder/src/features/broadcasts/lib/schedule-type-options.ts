import {
  type BroadcastScheduleType,
  broadcastScheduleTypes,
} from "@chatbotx.io/database/partials"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"

/**
 * `BroadcastScheduleType` → the message key that labels it.
 *
 * The enum value and the message key deliberately differ (`future` is labelled
 * "Schedule for later", keyed `scheduled`), so every surface that renders a
 * schedule type reads the label from here instead of interpolating the enum
 * value into a key — that drift is what rendered the missing key
 * `fields.schedule.future` verbatim in the broadcast detail dialog.
 *
 * `satisfies Record<BroadcastScheduleType, …>` makes adding a value to
 * `broadcastScheduleTypes` a compile error here until it has a label.
 */
export const BROADCAST_SCHEDULE_TYPE_MESSAGE_KEY = {
  now: "fields.schedule.now",
  future: "fields.schedule.scheduled",
} as const satisfies Record<BroadcastScheduleType, string>

export type BroadcastScheduleTypeMessageKey =
  (typeof BROADCAST_SCHEDULE_TYPE_MESSAGE_KEY)[BroadcastScheduleType]

/**
 * Resolves the label key for a `schedulesType` read off a persisted row.
 *
 * The column is declared as `pgEnum(..., broadcastScheduleTypes.options as
 * [string, ...string[]])`, so the model type widens to `string` — the same
 * reason the detail dialog already narrows `channel`/`subaction` with
 * `safeParse`. An unrecognised value falls back to `now`: a row whose schedule
 * type cannot be parsed must not be presented as "scheduled for later".
 */
export const resolveBroadcastScheduleTypeMessageKey = (
  scheduleType: string,
): BroadcastScheduleTypeMessageKey => {
  const parsed = broadcastScheduleTypes.safeParse(scheduleType)
  return BROADCAST_SCHEDULE_TYPE_MESSAGE_KEY[
    parsed.success ? parsed.data : broadcastScheduleTypes.enum.now
  ]
}

/**
 * Schedule-type select options, in enum order. Takes the translator rather
 * than calling `useTranslations` itself so it stays a plain function usable
 * from any form (and directly testable).
 */
export const buildBroadcastScheduleTypeOptions = (
  translate: (key: BroadcastScheduleTypeMessageKey) => string,
): SelectOption[] =>
  broadcastScheduleTypes.options.map((value) => ({
    value,
    label: translate(BROADCAST_SCHEDULE_TYPE_MESSAGE_KEY[value]),
  }))
