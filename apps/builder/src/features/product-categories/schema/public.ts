import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

// Two-level tree: `parentId` is null for a top-level category, or the id of
// its top-level parent. Dropping this field would silently flatten the tree
// on the client (see product-categories/api/authorized.ts).
export const publicProductCategoryResource = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  isVisible: z.boolean(),
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
  imageUrl: z.string().nullable(),
  isVisible: z.boolean(),
  rank: z.number(),
})

export const createProductCategoryPublicRequest = z.object({
  name: z.string().trim().min(1).max(255).describe("Category name."),
  parentId: zodBigintAsString()
    .nullish()
    .describe("Parent category id, or omit/null for a top-level category."),
  rank: z
    .number()
    .int()
    .optional()
    .describe("Sort order among sibling categories."),
  imageUrl: z
    .string()
    .trim()
    .url()
    .max(2048)
    .nullish()
    .describe("Category image URL."),
  isVisible: z
    .boolean()
    .optional()
    .describe("Off hides the category and its products from customers."),
})

export const updateProductCategoryPublicRequest =
  createProductCategoryPublicRequest.extend({
    id: zodBigintAsString().describe(
      "Product category id. Get it from `productCategories.list`.",
    ),
  })

export const listProductCategoriesPublicRequest = z.object({
  parentId: zodBigintAsString()
    .optional()
    .describe(
      "Only this category's sub-categories. Omit for the whole tree (top-level categories have a null `parentId`).",
    ),
  name: z
    .string()
    .trim()
    .max(255)
    .optional()
    .describe("Only categories whose name contains this, ignoring case."),
})

export const setProductCategoryVisiblePublicRequest = z.object({
  id: zodBigintAsString().describe(
    "Product category id. Get it from `productCategories.list`.",
  ),
  isVisible: z
    .boolean()
    .describe("False hides the category and its products from customers."),
})
