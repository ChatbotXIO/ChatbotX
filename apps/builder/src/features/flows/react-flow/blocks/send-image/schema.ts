import { buttonBlockSchema } from "@/features/flows/react-flow/blocks/button/schema"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const sendImageBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.enum([ActionType.SendImage]),
  // file: z.instanceof(File).optional(),
  url: z.string().trim().url(),
  buttons: z.array(buttonBlockSchema),
})

export type SendImageBlockSchema = z.infer<typeof sendImageBlockSchema>

export const sendImageBlockDefaultValue = (): SendImageBlockSchema => ({
  id: createId(),
  actionType: ActionType.SendImage,
  url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQf5GRKMzldUwuZJ7IfmvoLMru3gjphUJDGuA&s",
  buttons: [],
})
