import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { imageBlockSchema } from "@/features/flows/react-flow/blocks/image/schema";
import { BlockType } from "../types"

export const videoBlockSchema= imageBlockSchema.extend({
  blockType: z.enum([BlockType.Video]),
})

export type VideoBlockSchema = z.infer<typeof videoBlockSchema>

export const videoBlockSchemaDefaultValue = (): VideoBlockSchema => ({
  id: createId(),
  blockType: BlockType.Video,
  url: "https://www.w3schools.com/html/mov_bbb.mp4",
  buttons: []
})
