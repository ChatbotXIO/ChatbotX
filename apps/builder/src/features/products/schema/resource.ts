import { createSelectSchema, productModel } from "@chatbotx.io/database/schema"
import z from "zod"

export const productResource = createSelectSchema(productModel, {
  id: z.string(),
  workspaceId: z.string(),
  images: z.array(z.any()),
  tags: z.array(z.any()),
})
export type ProductResource = z.infer<typeof productResource>
