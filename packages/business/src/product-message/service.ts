import {
  channelAwareStepValidators,
  getChannelFlowPolicy,
  resolveStepValidator,
  type SendProductsContent,
  sendProductsStepDefaultFn,
  stepTypes,
} from "@chatbotx.io/flow-config"
import type {
  MessageProductEntity,
  ResolvedInboundProductReference,
  ResolvedProductMessage,
} from "@chatbotx.io/sdk"
import { ProductMessageUnresolvableError, validationException } from "../errors"
import { logger } from "../logger"

import {
  resolveProductCatalogSource,
  type SendableProductRecord,
  unresolvedInboundReference,
} from "./catalog-sources"
import {
  collectProductIds,
  type MissingProduct,
  resolveProductMessage,
} from "./resolve-message"

export type SendableProduct = Pick<
  SendableProductRecord,
  "name" | "imageUrl" | "price" | "currency"
> & { id: string }

export type SendableProductsResult = {
  /** False when nothing can be listed; `reason` says why. */
  ready: boolean
  reason?: "channelUnsupported" | "catalogNotConnected"
  data: SendableProduct[]
  pageCount: number
}

export type ResolvedProductMessageResult = {
  message: ResolvedProductMessage
  /** Products the message named that were not sendable and were left out. */
  missing: MissingProduct[]
}

/** What a sender needs to store and dispatch one product message. */
export type PreparedProductMessage = ResolvedProductMessageResult & {
  /** The message's own text, shown in lists and previews. */
  text: string | null
  contentAttributes: MessageProductEntity
}

/**
 * `reject`: a human or API caller asked for exactly these products, so a
 * message that would go out without some of them is refused. `drop`: a flow
 * sends what is still sendable and reports the rest.
 */
export type MissingProductPolicy = "reject" | "drop"

const resolveProductMessageText = (
  message: ResolvedProductMessage,
): string | null =>
  message.body ??
  (message.display === "products" ? message.header : null) ??
  null

class ProductMessageService {
  /** Products the flow step's picker may offer for `channel`. */
  async listSendable(input: {
    workspaceId: string
    channel: string
    keyword?: string
    productIds?: string[]
    page?: number
    perPage?: number
  }): Promise<SendableProductsResult> {
    const source = this.supportedSource(input.channel)
    if (!source) {
      return {
        ready: false,
        reason: "channelUnsupported",
        data: [],
        pageCount: 0,
      }
    }

    const page = await source.listSendable(input)
    if (!page.ready) {
      return {
        ready: false,
        reason: "catalogNotConnected",
        data: [],
        pageCount: 0,
      }
    }
    return {
      ready: true,
      data: page.items.map(
        ({ productId, name, imageUrl, price, currency }) => ({
          id: productId,
          name,
          imageUrl,
          price,
          currency,
        }),
      ),
      pageCount: page.pageCount,
    }
  }

  /**
   * Names the catalog items a contact sent back (a cart, a product question).
   * Raw identity is authoritative and the lookup is best effort: a catalog this
   * workspace never connected, or a lookup that fails, still yields one
   * reference per distinct retailer id (first-seen order) with `product: null`,
   * so the contact's message is never lost to a catalog problem. A channel with
   * no catalog source has nothing to name and gets an empty list.
   */
  async resolveInboundProducts(input: {
    workspaceId: string
    channel: string
    catalogId: string
    retailerIds: string[]
  }): Promise<ResolvedInboundProductReference[]> {
    // Not `supportedSource`: recognising what a contact sent must not depend on
    // whether the channel's outbound product-message policy is enabled.
    const source = resolveProductCatalogSource(input.channel)
    if (!source) {
      return []
    }
    const retailerIds = [...new Set(input.retailerIds)]
    if (retailerIds.length === 0) {
      return []
    }
    try {
      return await source.resolveInbound({
        workspaceId: input.workspaceId,
        catalogId: input.catalogId,
        retailerIds,
      })
    } catch (err) {
      logger.warn(
        { err, workspaceId: input.workspaceId, channel: input.channel },
        "Inbound product lookup failed; reporting the references unresolved",
      )
      return retailerIds.map((retailerId) =>
        unresolvedInboundReference(source.name, {
          catalogId: input.catalogId,
          retailerId,
        }),
      )
    }
  }

  /**
   * The one entry for sending a product message: validates it against the
   * channel's rules, resolves its product ids with a single catalog lookup, and
   * returns what to store and dispatch. Used by flow steps and by messages sent
   * outside a flow (inbox, public API). Throws `validationException` for a
   * message that breaks the channel's rules and `ProductMessageUnresolvableError`
   * when nothing valid can be built.
   */
  async prepareOutgoing(input: {
    workspaceId: string
    channel: string
    content: SendProductsContent
    onMissing: MissingProductPolicy
  }): Promise<PreparedProductMessage> {
    const { workspaceId, channel, content, onMissing } = input
    if (!getChannelFlowPolicy(channel)?.productMessages) {
      throw new ProductMessageUnresolvableError("channelUnsupported")
    }

    const validator = channelAwareStepValidators[stepTypes.enum.sendProducts]
    const validation = validator
      ? resolveStepValidator(validator, channel).safeParse(
          sendProductsStepDefaultFn(content),
        )
      : undefined
    if (validation && !validation.success) {
      throw validationException("products", "Invalid product message", {
        issues: validation.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      })
    }

    const { message, missing } = await this.resolveForSend({
      workspaceId,
      channel,
      content,
    })
    if (onMissing === "reject" && missing.length > 0) {
      throw new ProductMessageUnresolvableError(
        "productsNotSendable",
        missing.map(({ productId }) => productId),
      )
    }

    return {
      message,
      missing,
      text: resolveProductMessageText(message),
      contentAttributes: { type: "product_message", payload: message },
    }
  }

  /**
   * Resolves a message's product ids for one send with a single catalog lookup.
   * Throws `ProductMessageUnresolvableError` when nothing valid can be built.
   */
  private async resolveForSend(input: {
    workspaceId: string
    channel: string
    content: SendProductsContent
  }): Promise<ResolvedProductMessageResult> {
    const capability = getChannelFlowPolicy(input.channel)?.productMessages
    const source = this.supportedSource(input.channel)
    const displayRule = capability?.displays[input.content.display]
    if (!(capability && source && displayRule)) {
      throw new ProductMessageUnresolvableError("channelUnsupported")
    }

    const lookup = await source.findSendable({
      workspaceId: input.workspaceId,
      productIds: collectProductIds(input.content),
    })
    if (!lookup.ready) {
      throw new ProductMessageUnresolvableError("catalogNotConnected")
    }

    const resolution = resolveProductMessage({
      capability,
      content: input.content,
      sendableById: new Map(lookup.items.map((item) => [item.productId, item])),
    })
    if (!resolution.ok) {
      // `prepareOutgoing` already validated the message, so this is a defensive
      // guard for a caller that skipped it.
      if (resolution.reason === "invalidMessage") {
        throw validationException("products", "Invalid product message")
      }
      throw new ProductMessageUnresolvableError(resolution.reason)
    }
    return { message: resolution.message, missing: resolution.missing }
  }

  private supportedSource(channel: string) {
    return getChannelFlowPolicy(channel)?.productMessages
      ? resolveProductCatalogSource(channel)
      : undefined
  }
}

export const productMessageService = new ProductMessageService()
