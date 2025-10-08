import { CardLayout } from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { buttonStepSchema } from "./button"
import { sendImageStepDefaultFn, sendImageStepSchema } from "./send-image"
import { StepType } from "./step-action"

export const sendCardStepSchema = z.object({
  id: z.string(),
  stepType: z.literal(StepType.SEND_CARD),
  layout: z.enum(CardLayout),
  title: z.string().trim().min(1).max(255),
  subtitle: z.string().trim().max(255).optional(),
  cardURL: z.string().trim().url().optional(),
  image: sendImageStepSchema.optional(),
  buttons: z.array(buttonStepSchema),
})

export type SendCardStepSchema = z.infer<typeof sendCardStepSchema>

export const sendCardStepDefaultFn = (): SendCardStepSchema => ({
  id: createId(),
  stepType: StepType.SEND_CARD,
  layout: CardLayout.HORIZONTAL,
  title: "",
  cardURL: "",
  image: sendImageStepDefaultFn(),
  buttons: [],
})
