import { buttonBlockSchema } from "@/features/flows/react-flow/blocks/button/schema"
import { sendImageBlockSchema } from "@/features/flows/react-flow/blocks/send-image/schema"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export enum CardLayout {
  Vertical = "Vertical",
  Horizontal = "Horizontal",
}

export const sendCardBlockSchema = z.object({
  id: z.string(),
  actionType: z.enum([ActionType.SendCard]),
  title: z.string().min(1).max(255).trim(),
  subtitle: z.string().max(255).trim().optional(),
  cardType: z.nativeEnum(CardLayout),
  image: sendImageBlockSchema.optional(),
  buttons: z.array(buttonBlockSchema).optional(),
})

export type SendCardBlockSchema = z.infer<typeof sendCardBlockSchema>

export const sendCardBlockDefaultValue = (): SendCardBlockSchema => ({
  id: createId(),
  actionType: ActionType.SendCard,
  title: "",
  cardType: CardLayout.Horizontal,
})
