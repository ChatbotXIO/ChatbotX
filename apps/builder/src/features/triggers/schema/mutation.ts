import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { allConditions } from "../../conditions/schemas"
import { allActions } from "../components/actions/schemas"

export const createTriggerSchema = z.object({
  name: z.string().min(1, "Trigger name is required"),
  folderId: zodBigintAsString().nullable(),
})
export type CreateTriggerSchema = z.infer<typeof createTriggerSchema>

export const updateTriggerSchema = z.object({
  conditions: z.array(z.union(Object.values(allConditions))),
  actions: z.array(z.union(Object.values(allActions))),
})
export type UpdateTriggerSchema = z.infer<typeof updateTriggerSchema>
