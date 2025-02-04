import { ActionType } from "@/features/flows/react-flow/action-type"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const imageBlockSchema = z.object({
  id: z.string().cuid2(),
  url: z.string().min(1),
  actionType: z.enum([ActionType.Image]),
})
export type ImageBlockSchema = z.infer<typeof imageBlockSchema>

export const imageBlockDefaultValue = (
  url = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQf5GRKMzldUwuZJ7IfmvoLMru3gjphUJDGuA&s",
): ImageBlockSchema => ({
  id: createId(),
  url,
  actionType: ActionType.Image,
})
