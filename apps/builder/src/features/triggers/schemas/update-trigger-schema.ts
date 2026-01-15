import z from "zod"
import { allConditions } from "../../conditions/schemas"
import { allActions } from "../components/actions/schemas"

export const updateTriggerSchema = z.object({
  conditions: z.array(z.union(Object.values(allConditions))),
  actions: z.array(z.union(Object.values(allActions))),
})
export type UpdateTriggerSchema = z.infer<typeof updateTriggerSchema>
