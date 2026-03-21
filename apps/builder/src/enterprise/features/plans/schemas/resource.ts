import { createSelectSchema, planModel } from "@chatbotx.io/database/schema"
import type z from "zod"

export const planResource = createSelectSchema(planModel)
export type PlanResource = z.infer<typeof planResource>
