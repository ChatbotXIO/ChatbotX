import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export enum ButtonActionType {
  SendMessage = "SendMessage",
  OpenWebsite = "OpenWebsite",
  CallPhoneNumber = "CallPhoneNumber",
  PerformAction = "PerformAction",
  StartAnotherFlow = "StartAnotherFlow",
  StartAnotherStep = "StartAnotherStep",
  StartExternalStep = "StartExternalStep",
}

export const buttonActionBlockSchema = z.object({
  actionType: z.nativeEnum(ButtonActionType).nullable(),
  // TOOD: add more detail
})

export const buttonBlockSchema = z.object({
  id: z.string().cuid2(),
  label: z.string().min(1).max(100),
  actions: z.array(buttonActionBlockSchema),
})
export type ButtonBlockSchema = z.infer<typeof buttonBlockSchema>

export const buttonBlockDefaultValue = (label = ""): ButtonBlockSchema => ({
  id: createId(),
  label,
  actions: [],
})
