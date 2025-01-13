import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"
import { type ButtonBlockSchema, buttonBlockSchema } from "../button/schema"

export const sendTextBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.enum([ActionType.SendText]),
  message: z.string().min(1).max(1000).trim(),
  buttons: z.array(buttonBlockSchema),
})

export type SendTextBlockSchema = z.infer<typeof sendTextBlockSchema>

export const sendTextBlockDefaultValue = (
  message = "",
  buttons: ButtonBlockSchema[] = [],
): SendTextBlockSchema => ({
  id: createId(),
  actionType: ActionType.SendText,
  message,
  buttons,
})
