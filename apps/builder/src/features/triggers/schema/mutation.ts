import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { allConditions } from "../../conditions/schema"
import { allActions } from "../components/actions/schema"

export const createTriggerSchema = z.object({
  name: z.string().min(1, "Trigger name is required").describe("Trigger name."),
  folderId: zodBigintAsString()
    .nullable()
    .describe(
      "Folder id (numeric string) to create the trigger in, or null for no folder.",
    ),
})
export type CreateTriggerSchema = z.infer<typeof createTriggerSchema>

export const updateTriggerSchema = z.object({
  conditions: z
    .array(z.union(Object.values(allConditions)))
    .describe("Conditions that must all match for this trigger to fire."),
  actions: z
    .array(z.union(Object.values(allActions)))
    .describe("Actions to run in order when this trigger fires."),
})
export type UpdateTriggerSchema = z.infer<typeof updateTriggerSchema>
