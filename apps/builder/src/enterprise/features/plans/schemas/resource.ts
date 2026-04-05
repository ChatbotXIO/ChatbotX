import { createSelectSchema, planModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import type z from "zod"

export const planResource = createSelectSchema(planModel, {
  id: zodBigintAsString(),
})
export type PlanResource = z.infer<typeof planResource>
