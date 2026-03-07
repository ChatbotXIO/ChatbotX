import { createSelectSchema, planModel } from "@aha.chat/database/schema"
import type z from "zod"

export const planResouce = createSelectSchema(planModel)
export type PlanResouce = z.infer<typeof planResouce>
