import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const ActiveCampaignOperation = {
  createOrUpdate: "create_or_update",
  addToAutomation: "add_to_automation",
} as const

const baseSchema = z.object({
  id: z.cuid2(),
  successNodeId: z.string().optional(),
  errorNodeId: z.string().optional(),
})

export const activeCampaignStepSchema = z.discriminatedUnion("operation", [
  baseSchema.extend({
    stepType: z.literal(StepType.activeCampaign),
    operation: z.literal(ActiveCampaignOperation.createOrUpdate),
    emailField: z.string().min(1),
    phoneField: z.string().optional(),
    listId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    mergeFields: z
      .array(
        z.object({
          chatbotField: z.string(),
          activeCampaignField: z.string().min(1),
        }),
      )
      .optional(),
  }),
  baseSchema.extend({
    stepType: z.literal(StepType.activeCampaign),
    operation: z.literal(ActiveCampaignOperation.addToAutomation),
    emailField: z.string().min(1),
    automationId: z.string().min(1),
  }),
])

export type ActiveCampaignStepSchema = z.infer<typeof activeCampaignStepSchema>

export const activeCampaignDefaultFn = (): ActiveCampaignStepSchema => ({
  id: createId(),
  stepType: StepType.activeCampaign,
  operation: ActiveCampaignOperation.createOrUpdate,
  emailField: "email",
  phoneField: "",
  listId: "",
  tags: [],
  mergeFields: [],
})
