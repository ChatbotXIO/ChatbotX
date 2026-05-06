import { createSelectSchema, productModel } from "@chatbotx.io/database/schema"
import z from "zod"

export const productResource = createSelectSchema(productModel, {
  id: z.string(),
  workspaceId: z.string(),
  images: z.array(
    z.object({ url: z.string(), type: z.enum(["link", "file"]) }),
  ),
  tags: z.array(z.string()),
})
export type ProductResource = z.infer<typeof productResource>
