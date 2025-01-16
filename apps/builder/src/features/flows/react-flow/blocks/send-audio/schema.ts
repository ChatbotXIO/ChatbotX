import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"
import { buttonBlockSchema } from "../button/schema"

export const sendAudioBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.enum([ActionType.SendAudio]),
  url: z.string().url(),
  buttons: z.array(buttonBlockSchema),
})

export type SendAudioBlockSchema = z.infer<typeof sendAudioBlockSchema>

export const sendAudioBlockDefaultValue = (): SendAudioBlockSchema => ({
  id: createId(),
  actionType: ActionType.SendAudio,
  url: "https://www.w3schools.com/html/horse.ogg",
  buttons: [],
})
