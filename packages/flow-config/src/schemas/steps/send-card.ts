import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { buttonStepSchema } from "./button"
import { sendImageStepSchema } from "./send-image"
import { StepType } from "./step-action"

export const CardLayout = {
  Vertical: "Vertical",
  Horizontal: "Horizontal",
} as const

export const sendCardStepSchema = z.object({
  id: z.string(),
  stepType: z.literal(StepType.SEND_CARD),
  title: z.string().trim().min(1).max(255),
  subtitle: z.string().trim().max(255).optional(),
  cardType: z.nativeEnum(CardLayout),
  image: sendImageStepSchema.optional(),
  buttons: z.array(buttonStepSchema).optional(),
})

export type SendCardStepSchema = z.infer<typeof sendCardStepSchema>

export const sendCardStepDefaultFn = (): SendCardStepSchema => ({
  id: createId(),
  stepType: StepType.SEND_CARD,
  title: "",
  cardType: CardLayout.Horizontal,
})
