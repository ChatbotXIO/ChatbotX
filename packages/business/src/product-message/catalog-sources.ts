import { metaCatalogItemRepository } from "@chatbotx.io/database/repositories"
import type {
  InboundCatalogProductReference,
  ProductCatalogSource,
  ProductMessageItem,
  ResolvedInboundProductReference,
} from "@chatbotx.io/sdk"
import { type ChannelType, channelTypes } from "@chatbotx.io/utils/channel"
import { integrationMetaCatalogService } from "../meta-catalog/integration.service"

/** A product a channel can show, with the catalog identity the channel needs. */
export type SendableProductRecord = ProductMessageItem

type SendableProductPage = {
  /** False when the workspace has no catalog for this source to read from. */
  ready: boolean
  items: SendableProductRecord[]
  pageCount: number
}

/**
 * How one catalog system lists and resolves sendable products. A channel is
 * bound to a source below; supporting another catalog is one more entry here.
 */
export type ProductCatalogSourceStrategy = {
  /** The source's own name, stamped on every catalog reference it produces. */
  name: ProductCatalogSource
  listSendable(input: {
    workspaceId: string
    keyword?: string
    productIds?: string[]
    page?: number
    perPage?: number
  }): Promise<SendableProductPage>
  findSendable(input: {
    workspaceId: string
    productIds: string[]
  }): Promise<{ ready: boolean; items: SendableProductRecord[] }>
  /**
   * Matches what a contact sent back (retailer ids from one catalog) to the
   * workspace's products. Returns one reference per input id, in input order;
   * an id that is not linked here keeps `product: null`.
   */
  resolveInbound(input: {
    workspaceId: string
    catalogId: string
    retailerIds: string[]
  }): Promise<ResolvedInboundProductReference[]>
}

/** An inbound id this source cannot name: its identity is kept, the product is not. */
export const unresolvedInboundReference = (
  source: ProductCatalogSource,
  reference: InboundCatalogProductReference,
): ResolvedInboundProductReference => ({
  catalogReference: { source, ...reference },
  product: null,
})

type MetaCatalogRow = Awaited<
  ReturnType<typeof metaCatalogItemRepository.findSendableByProductIds>
>[number]

const toSendableProductRecord = (
  row: MetaCatalogRow,
): SendableProductRecord => ({
  productId: row.productId,
  name: row.name,
  imageUrl: row.images[0]?.url ?? null,
  price: row.price,
  currency: row.currency,
  catalogReference: {
    source: "metaCatalog",
    catalogId: row.catalogId,
    retailerId: row.retailerId,
  },
})

/**
 * The connection's current catalog is the only one a send may use — a rebound
 * connection must not resurrect links to the catalog it left.
 */
const resolveMetaCatalogScope = async (workspaceId: string) => {
  const connection =
    await integrationMetaCatalogService.findByWorkspaceId(workspaceId)
  return connection?.catalogId
    ? {
        integrationMetaCatalogId: connection.id,
        catalogId: connection.catalogId,
      }
    : null
}

const metaCatalogSource: ProductCatalogSourceStrategy = {
  name: "metaCatalog",
  async listSendable(input) {
    const scope = await resolveMetaCatalogScope(input.workspaceId)
    if (!scope) {
      return { ready: false, items: [], pageCount: 0 }
    }
    const page = await metaCatalogItemRepository.listSendableProducts({
      ...scope,
      ...input,
    })
    return {
      ready: true,
      items: page.data.map(toSendableProductRecord),
      pageCount: page.pageCount,
    }
  },

  async findSendable(input) {
    const scope = await resolveMetaCatalogScope(input.workspaceId)
    if (!scope) {
      return { ready: false, items: [] }
    }
    const rows = await metaCatalogItemRepository.findSendableByProductIds({
      ...scope,
      ...input,
    })
    return { ready: true, items: rows.map(toSendableProductRecord) }
  },

  async resolveInbound(input) {
    const unresolved = input.retailerIds.map((retailerId) =>
      unresolvedInboundReference("metaCatalog", {
        catalogId: input.catalogId,
        retailerId,
      }),
    )
    const scope = await resolveMetaCatalogScope(input.workspaceId)
    // A cart from a catalog this workspace never connected must still be
    // reported, just without products — never matched against another catalog.
    if (!scope || scope.catalogId !== input.catalogId) {
      return unresolved
    }
    const rows =
      await metaCatalogItemRepository.findLinkedProductsByRetailerIds({
        ...scope,
        ...input,
      })
    const recordByRetailerId = new Map(
      rows.map((row) => [row.retailerId, toSendableProductRecord(row)]),
    )
    return unresolved.map((reference) => {
      const record = recordByRetailerId.get(
        reference.catalogReference.retailerId,
      )
      if (!record) {
        return reference
      }
      const { catalogReference, ...product } = record
      return { catalogReference, product }
    })
  },
}

const productCatalogSources: Record<
  ProductCatalogSource,
  ProductCatalogSourceStrategy
> = {
  metaCatalog: metaCatalogSource,
}

/** A channel with no entry cannot send products, whatever its policy says. */
const catalogSourceByChannel: Partial<
  Record<ChannelType, ProductCatalogSource>
> = {
  whatsapp: "metaCatalog",
}

export const resolveProductCatalogSource = (
  channel: string,
): ProductCatalogSourceStrategy | undefined => {
  const parsed = channelTypes.safeParse(channel)
  const source = parsed.success
    ? catalogSourceByChannel[parsed.data]
    : undefined
  return source ? productCatalogSources[source] : undefined
}
