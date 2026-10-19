import {
  workingHoursDateRangesSchema,
  workingHoursIntervalSchema,
  workingHoursLocalDateSchema,
} from "@chatbotx.io/database/partials"
import { z } from "zod"

const workingHoursDateOverrideResource = z.object({
  date: workingHoursLocalDateSchema.describe(
    "Local calendar date (`YYYY-MM-DD`) in the workspace timezone.",
  ),
  name: z.string().nullable().describe("Optional label, e.g. a holiday name."),
  ranges: workingHoursDateRangesSchema.describe(
    "Open ranges for that date, replacing the weekly intervals; an EMPTY list means closed all day. Minutes since local midnight, end-exclusive (`24:00` = 1440).",
  ),
})
export type WorkingHoursDateOverrideResource = z.infer<
  typeof workingHoursDateOverrideResource
>

export const workingHoursHolidayResource =
  workingHoursDateOverrideResource.extend({
    id: z.string().describe("Holiday id."),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
export type WorkingHoursHolidayResource = z.infer<
  typeof workingHoursHolidayResource
>

export const workingHoursResource = z.object({
  id: z.string().describe("Working-hours schedule id."),
  name: z.string().describe("Schedule name."),
  intervals: z
    .array(workingHoursIntervalSchema)
    .describe(
      "Weekly working intervals in the WORKSPACE timezone, sorted by weekday then start. `weekday` 0=Sunday..6=Saturday; `startMinute`/`endMinute` are minutes since local midnight, end-exclusive (`24:00` = 1440).",
    ),
  memberUserIds: z
    .array(z.string())
    .describe(
      "User ids of the workspace members measured against this schedule (one schedule per member).",
    ),
  dateOverrides: z
    .array(workingHoursDateOverrideResource)
    .optional()
    .describe(
      "Dates that differ from the weekly intervals (this schedule only; workspace-wide holidays are listed by `workingHours.listHolidays`). Returned by `workingHours.get` and `workingHours.update`, omitted by `workingHours.list`.",
    ),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type WorkingHoursResource = z.infer<typeof workingHoursResource>
