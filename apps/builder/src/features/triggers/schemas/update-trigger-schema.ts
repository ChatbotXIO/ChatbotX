import z from "zod"
import { allActions } from "../components/actions/schemas"
import { allConditions } from "../components/conditions/schemas"

export const updateTriggerSchema = z.object({
  conditions: z.array(z.union(Object.values(allConditions))),
  actions: z.array(z.union(Object.values(allActions))),
})
export type UpdateTriggerSchema = z.infer<typeof updateTriggerSchema>
