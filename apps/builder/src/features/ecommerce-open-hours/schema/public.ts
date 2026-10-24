import {
  openHoursRangeSchema,
  openHoursScheduleSchema,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const publicOpenHoursResource = z.object({
  id: z.string(),
  name: z.string(),
  ranges: z.array(openHoursRangeSchema),
})
export type OpenHoursResource = z.infer<typeof publicOpenHoursResource>

export const listOpenHoursPublicResponse = z.object({
  data: z.array(publicOpenHoursResource),
})

export const createOpenHoursPublicRequest = openHoursScheduleSchema

export const updateOpenHoursPublicRequest = openHoursScheduleSchema
  .partial()
  .extend({
    id: zodBigintAsString().describe(
      "Open-hours schedule id. Get it from `openHours.list`.",
    ),
  })
