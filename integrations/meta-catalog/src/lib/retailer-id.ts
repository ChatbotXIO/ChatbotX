/**
 * Which value travels to Meta as the item's Content ID (`retailer_id`).
 *
 * Merchants recognise their own SKU, not our internal product id, and the
 * import direction already writes Meta's `retailer_id` into `Product.sku` — so
 * pushing the SKU closes the round trip. Two constraints shape the choice:
 *
 * - A Content ID is immutable in practice. Re-pushing an item under a new id
 *   makes Meta create a *second* item instead of updating the first, so a
 *   product that already carries a link keeps that id forever.
 * - A Content ID is unique per catalog (`MetaCatalogItem_integration_retailer_key`
 *   enforces the same locally). A duplicate or already-claimed SKU therefore
 *   cannot be used, and the product falls back to its id.
 */
export type RetailerIdCandidate = {
  id: string
  sku?: string | null
}

export type ResolveRetailerIdsInput = {
  /**
   * Resolution order decides who wins a duplicate SKU, so the caller's order
   * has to be stable — `listForCatalogSync` sorts by id for exactly this
   * reason. Re-running a sync then produces the same assignment.
   */
  products: readonly RetailerIdCandidate[]
  /** The id each product already carries in this catalog, by product id. */
  linkedByProductId: ReadonlyMap<string, string>
  /**
   * Every Content ID this catalog has already handed out, mapped to its owning
   * product — including products outside this run's scope, whose links a reused
   * SKU would otherwise steal.
   */
  ownerByRetailerId?: ReadonlyMap<string, string>
}

export const resolveRetailerIds = ({
  products,
  linkedByProductId,
  ownerByRetailerId,
}: ResolveRetailerIdsInput): Map<string, string> => {
  // Product ids are the guaranteed fallback, so they are spoken for from the
  // start: a SKU that happens to equal another product's id cannot take it and
  // leave that product with nothing.
  const ownerOf = new Map(products.map((product) => [product.id, product.id]))
  for (const [retailerId, productId] of ownerByRetailerId ?? []) {
    ownerOf.set(retailerId, productId)
  }
  for (const product of products) {
    const linked = linkedByProductId.get(product.id)
    if (linked) {
      ownerOf.set(linked, product.id)
    }
  }

  const resolved = new Map<string, string>()
  for (const product of products) {
    const linked = linkedByProductId.get(product.id)
    if (linked) {
      resolved.set(product.id, linked)
      continue
    }
    const sku = product.sku?.trim()
    const owner = sku ? ownerOf.get(sku) : undefined
    if (sku && (owner === undefined || owner === product.id)) {
      ownerOf.set(sku, product.id)
      resolved.set(product.id, sku)
      continue
    }
    resolved.set(product.id, product.id)
  }
  return resolved
}
