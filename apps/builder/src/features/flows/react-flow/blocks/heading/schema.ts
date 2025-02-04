import { ActionType } from "@/features/flows/react-flow/action-type"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const headingBlockSchema = z.object({
  id: z.string().cuid2(),
  heading: z.string().min(1).max(100),
  actionType: z.enum([ActionType.Heading]),
})
export type HeadingBlockSchema = z.infer<typeof headingBlockSchema>

export const headingBlockDefaultValue = (heading = ""): HeadingBlockSchema => ({
  id: createId(),
  heading,
  actionType: ActionType.Heading,
})
