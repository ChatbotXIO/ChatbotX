import {
  WORKING_HOURS_MAX_NAME_LENGTH,
  workingHoursDateOverridesSchema,
  workingHoursDateRangesSchema,
  workingHoursIntervalsSchema,
  workingHoursLocalDateSchema,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const WORKING_HOURS_MAX_MEMBERS_PER_REQUEST = 1000

const nameField = z.string().trim().min(1).max(255)

const intervalsField = workingHoursIntervalsSchema.describe(
  "Weekly working intervals in the WORKSPACE timezone. `weekday` 0=Sunday..6=Saturday; `startMinute`/`endMinute` are minutes since local midnight, end-exclusive (`24:00` = 1440). Max 10 per weekday and 70 in total; intervals on one weekday must not overlap.",
)

const userIdsField = z
  .array(zodBigintAsString())
  .max(WORKING_HOURS_MAX_MEMBERS_PER_REQUEST)
  .describe(
    `Workspace member user ids (numeric strings, at most ${WORKING_HOURS_MAX_MEMBERS_PER_REQUEST}). Get them from \`workspaceMembers.list\` (\`userId\`). A user already on another schedule is moved here (one schedule per member).`,
  )

export const workingHoursIdPathParam = z.object({
  id: zodBigintAsString().describe(
    "Working-hours id. Get it from `workingHours.list`.",
  ),
})

export const createWorkingHoursRequest = z.object({
  name: nameField.describe("Schedule name (1-255 characters)."),
  intervals: intervalsField
    .optional()
    .describe(
      `${intervalsField.description} Omit for an empty schedule (no working time).`,
    ),
  userIds: userIdsField.optional().describe(userIdsField.description ?? ""),
})

export const updateWorkingHoursRequest = z
  .object({
    name: nameField.optional().describe("New name. Omitted = unchanged."),
    intervals: intervalsField
      .optional()
      .describe(
        `FULL replacement of the weekly intervals; omitted = unchanged. ${intervalsField.description}`,
      ),
    dateOverrides: workingHoursDateOverridesSchema
      .optional()
      .describe(
        "FULL replacement of this schedule's date overrides (omitted = unchanged, `[]` removes all). A date override replaces the weekly intervals of that local date (`ranges: []` = closed all day) and wins over a workspace holiday. At most 400, one per date.",
      ),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.intervals !== undefined ||
      value.dateOverrides !== undefined,
    {
      message: "Provide at least one of `name`, `intervals` or `dateOverrides`",
    },
  )

export const setWorkingHoursMembersRequest = z.object({
  userIds: userIdsField.describe(
    `FULL replacement of the schedule's members (empty array removes all). ${userIdsField.description}`,
  ),
})

const holidayNameField = z
  .string()
  .trim()
  .max(WORKING_HOURS_MAX_NAME_LENGTH)
  .nullish()

export const workingHoursHolidayIdPathParam = z.object({
  id: zodBigintAsString().describe(
    "Holiday id. Get it from `workingHours.listHolidays`.",
  ),
})

export const createHolidayRequest = z.object({
  date: workingHoursLocalDateSchema.describe(
    "Local calendar date (`YYYY-MM-DD`) in the workspace timezone. One holiday per date.",
  ),
  name: holidayNameField.describe("Optional label, e.g. `New Year`."),
  ranges: workingHoursDateRangesSchema.describe(
    "Open ranges on that date; an EMPTY list means closed all day. Minutes since local midnight, end-exclusive (`24:00` = 1440).",
  ),
})

export const updateHolidayRequest = z
  .object({
    name: holidayNameField.describe(
      "New label (null clears it); omitted = unchanged.",
    ),
    ranges: workingHoursDateRangesSchema
      .optional()
      .describe("FULL replacement of the open ranges; omitted = unchanged."),
  })
  .refine((value) => value.name !== undefined || value.ranges !== undefined, {
    message: "Provide at least one of `name` or `ranges`",
  })
