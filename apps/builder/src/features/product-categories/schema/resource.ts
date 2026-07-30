/**
 * One row of the (two-level) category tree, as both the sidebar filter and the
 * management tab receive it. The tree arrives flat — `parentId` is what turns
 * it back into a hierarchy on the client.
 */
export type ProductCategoryResource = {
  id: string
  /** Null for a top-level category. */
  parentId: string | null
  name: string
  rank: number
  productCount: number
}
