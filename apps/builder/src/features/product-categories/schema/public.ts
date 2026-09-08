import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

// Two-level tree: `parentId` is null for a top-level category, or the id of
// its top-level parent. Dropping this field would silently flatten the tree
// on the client (see product-categories/api/authorized.ts).
export const publicProductCategoryResource = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  rank: z.number(),
  productCount: z.number(),
})

export const listProductCategoriesPublicResponse = z.object({
  data: z.array(publicProductCategoryResource),
})

// `create`/`update` return the bare row (no joined product count), unlike
// `list`'s `publicProductCategoryResource`.
export const publicProductCategoryWriteResource = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  rank: z.number(),
})

export const createProductCategoryPublicRequest = z.object({
  name: z.string().trim().min(1).max(255),
  parentId: zodBigintAsString().nullish(),
  rank: z.number().int().optional(),
})

export const updateProductCategoryPublicRequest =
  createProductCategoryPublicRequest.extend({
    id: zodBigintAsString(),
  })
