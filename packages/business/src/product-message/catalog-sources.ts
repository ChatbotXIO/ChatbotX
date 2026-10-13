import { metaCatalogItemRepository } from "@chatbotx.io/database/repositories"
import type { ProductCatalogSource, ProductMessageItem } from "@chatbotx.io/sdk"
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
}

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
