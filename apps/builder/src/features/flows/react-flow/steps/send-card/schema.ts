import { buttonStepSchema } from "@/features/flows/react-flow/steps/button/schema"
import { sendImageStepSchema } from "@/features/flows/react-flow/steps/send-image/schema"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "../step-action"

export enum CardLayout {
  Vertical = "Vertical",
  Horizontal = "Horizontal",
}

export const sendCardStepSchema = z.object({
  id: z.string(),
  stepType: z.literal(StepType.SendCard),
  title: z.string().trim().min(1).max(255),
  subtitle: z.string().trim().max(255).optional(),
  cardType: z.nativeEnum(CardLayout),
  image: sendImageStepSchema.optional(),
  buttons: z.array(buttonStepSchema).optional(),
})

export type SendCardStepSchema = z.infer<typeof sendCardStepSchema>

export const sendCardStepDefaultFn = (): SendCardStepSchema => ({
  id: createId(),
  stepType: StepType.SendCard,
  title: "",
  cardType: CardLayout.Horizontal,
})
