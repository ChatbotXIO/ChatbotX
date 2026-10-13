import type { SendProductsStepSchema } from "@chatbotx.io/flow-config"
import { getChannelFlowPolicy } from "@chatbotx.io/flow-config"
import type { ResolvedProductMessage } from "@chatbotx.io/sdk"
import { ChatbotXException } from "../errors"
import {
  resolveProductCatalogSource,
  type SendableProductRecord,
} from "./catalog-sources"
import {
  collectProductIds,
  type MissingProduct,
  resolveProductMessage,
} from "./resolve-message"

export type ProductMessageUnresolvableReason =
  | "channelUnsupported"
  | "catalogNotConnected"
  | "noProductsSendable"
  | "invalidMessage"

/**
 * The step cannot become a message right now. Permanent for this send — the
 * author has to change the step or the catalog — so it is not worth retrying.
 */
export class ProductMessageUnresolvableError extends ChatbotXException {
  readonly reason: ProductMessageUnresolvableReason

  constructor(reason: ProductMessageUnresolvableReason) {
    super(
      `Product message cannot be sent: ${reason}`,
      "productMessageUnresolvable",
      422,
    )
    this.reason = reason
  }
}

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
  /** Products the step named that were not sendable and were left out. */
  missing: MissingProduct[]
}

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
   * Resolves a step's product ids for one send with a single catalog lookup.
   * Throws `ProductMessageUnresolvableError` when nothing valid can be built.
   */
  async resolveForSend(input: {
    workspaceId: string
    channel: string
    step: SendProductsStepSchema
  }): Promise<ResolvedProductMessageResult> {
    const capability = getChannelFlowPolicy(input.channel)?.productMessages
    const source = this.supportedSource(input.channel)
    const displayRule = capability?.displays[input.step.display]
    if (!(capability && source && displayRule)) {
      throw new ProductMessageUnresolvableError("channelUnsupported")
    }

    const lookup = await source.findSendable({
      workspaceId: input.workspaceId,
      productIds: collectProductIds(input.step),
    })
    if (!lookup.ready) {
      throw new ProductMessageUnresolvableError("catalogNotConnected")
    }

    const resolution = resolveProductMessage({
      capability,
      step: input.step,
      sendableById: new Map(lookup.items.map((item) => [item.productId, item])),
    })
    if (!resolution.ok) {
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
