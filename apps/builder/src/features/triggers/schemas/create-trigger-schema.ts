import z from "zod"
import { allActions } from "../components/actions/schemas"
import { allConditions } from "../components/conditions/schemas"

export const createTriggerSchema = z.object({
  name: z.string().min(1, "Trigger name is required"),
  folderId: z.cuid2().nullable(),
  conditions: z.array(z.union(Object.values(allConditions))).min(1),
  actions: z.array(z.union(Object.values(allActions))).default([]),
})
export type CreateTriggerSchema = z.infer<typeof createTriggerSchema>
