import { z } from "zod"

export const productCategoryFormSchema = z.object({
  name: z.string().trim().min(1).max(255),
  /**
   * Three distinct states, so no default may be applied here: `undefined` leaves
   * the category where it is (a rename), `null` puts it at the top level, and an
   * id files it under that parent. Collapsing absent into `null` would let a
   * caller that only sends a name silently un-parent a sub-category.
   */
  parentId: z.string().regex(/^\d+$/).nullable().optional(),
})
export type ProductCategoryForm = z.infer<typeof productCategoryFormSchema>
