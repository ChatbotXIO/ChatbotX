import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { imageBlockSchema } from "@/features/flows/react-flow/blocks/image/schema";
import { BlockType } from "../types"

export const audioBlockSchema= imageBlockSchema.extend({
  blockType: z.enum([BlockType.FileAudio]),
})

export type AudioBlockSchema = z.infer<typeof audioBlockSchema>

export const audioBlockSchemaDefaultValue = (): AudioBlockSchema => ({
  id: createId(),
  blockType: BlockType.FileAudio,
  url: "https://www.w3schools.com/html/horse.ogg",
  buttons: []
})
