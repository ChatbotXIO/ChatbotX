import { workingHoursIntervalsSchema } from "@chatbotx.io/database/partials"
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
  })
  .refine(
    (value) => value.name !== undefined || value.intervals !== undefined,
    { message: "Provide at least one of `name` or `intervals`" },
  )

export const setWorkingHoursMembersRequest = z.object({
  userIds: userIdsField.describe(
    `FULL replacement of the schedule's members (empty array removes all). ${userIdsField.description}`,
  ),
})
