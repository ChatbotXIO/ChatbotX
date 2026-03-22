import { createSelectSchema, planModel } from "@aha.chat/database/schema"
import type z from "zod"

export const planResource = createSelectSchema(planModel)
export type PlanResource = z.infer<typeof planResource>
