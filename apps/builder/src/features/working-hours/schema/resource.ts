import { workingHoursIntervalSchema } from "@chatbotx.io/database/partials"
import { z } from "zod"

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
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type WorkingHoursResource = z.infer<typeof workingHoursResource>
