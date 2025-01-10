import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { buttonBlockSchema } from "../button/schema";
import { ActionType } from "../../action-type";

export const sendVideoBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.enum([ActionType.SendVideo]),
  url: z.string().url(),
  buttons: z.array(buttonBlockSchema)
})

export type SendVideoBlockSchema = z.infer<typeof sendVideoBlockSchema>

export const sendVideoBlockDefaultValue = (): SendVideoBlockSchema => ({
  id: createId(),
  actionType: ActionType.SendVideo,
  url: "https://www.w3schools.com/html/mov_bbb.mp4",
  buttons: []
})
