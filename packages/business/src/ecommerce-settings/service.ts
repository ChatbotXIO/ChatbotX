import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  ECOMMERCE_SETTINGS_DEFAULTS,
  type EcommerceCheckoutSettings,
  type EcommerceGeneralSettings,
  type EcommercePaymentSettings,
  type EcommerceProFeature,
  type EcommerceSettings,
  type EcommerceShippingSettings,
  ecommerceProFeatures,
  ecommerceSettingsSchema,
} from "@chatbotx.io/database/partials"
import {
  type EcommerceSettingsValues,
  ecommerceSettingsRepository,
} from "@chatbotx.io/database/repositories"
import type { EcommerceSettingsModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { ecommerceOpenHoursService } from "../ecommerce-open-hours/service"
import { ChatbotXException, validationException } from "../errors"
import { flowService } from "../flow/service"

export type EcommerceSettingsPatch = {
  general?: Partial<EcommerceGeneralSettings>
  payments?: Partial<EcommercePaymentSettings>
  shipping?: Partial<EcommerceShippingSettings>
  checkout?: Partial<EcommerceCheckoutSettings>
}

export type EcommerceProFeatureAccess = Record<EcommerceProFeature, boolean>

const toSettings = (row: EcommerceSettingsModel): EcommerceSettings => ({
  general: {
    orderingAvailable: row.orderingAvailable,
    webshopProductView: row.webshopProductView,
    openHoursId: row.openHoursId,
    searchProducts: row.searchProducts,
    facebookPixelId: row.facebookPixelId,
    abandonedCartDelayMinutes: row.abandonedCartDelayMinutes,
    abandonedCartFlowId: row.abandonedCartFlowId,
    productButtons: row.productButtons,
    productImageSize: row.productImageSize,
    allowRateOrders: row.allowRateOrders,
    notifyOnCartStatusChange: row.notifyOnCartStatusChange,
  },
  payments: {
    paymentMethods: row.paymentMethods,
    currency: row.currency,
    currencyPosition: row.currencyPosition,
    currencySymbol: row.currencySymbol,
    serviceFeePercent: row.serviceFeePercent,
  },
  shipping: {
    shippingType: row.shippingType,
    storeAddress: row.storeAddress,
    shippingCountries: row.shippingCountries,
    defaultShippingCountry: row.defaultShippingCountry,
    deliveryCost: row.deliveryCost,
  },
  checkout: {
    checkoutMode: row.checkoutMode,
    checkoutLink: row.checkoutLink,
    checkoutFlowId: row.checkoutFlowId,
    minimumOrderValue: row.minimumOrderValue,
    orderConfirmationMode: row.orderConfirmationMode,
    orderConfirmationFlowId: row.orderConfirmationFlowId,
    requireName: row.requireName,
    requireEmail: row.requireEmail,
    requirePhone: row.requirePhone,
    requireState: row.requireState,
    requireZip: row.requireZip,
  },
})

/** Every column, so an insert never leans on a default the table lacks. */
/** The keys of a partial update that were actually sent. */
const definedOnly = <Group extends object>(group: Group | undefined) =>
  Object.fromEntries(
    Object.entries(group ?? {}).filter(([, value]) => value !== undefined),
  ) as Partial<Group>

const toValues = (settings: EcommerceSettings): EcommerceSettingsValues => ({
  ...settings.general,
  ...settings.payments,
  ...settings.shipping,
  ...settings.checkout,
})

/** Whether a patch turns a Pro feature on (turning one off is always allowed). */
const enabledProFeatures = (
  patch: EcommerceSettingsPatch,
): EcommerceProFeature[] => {
  const general = patch.general ?? {}
  const enabled: EcommerceProFeature[] = []
  if (general.openHoursId) {
    enabled.push("openHours")
  }
  if (general.searchProducts) {
    enabled.push("searchProducts")
  }
  if (general.facebookPixelId) {
    enabled.push("facebookPixel")
  }
  if (general.abandonedCartDelayMinutes) {
    enabled.push("abandonedCart")
  }
  return enabled
}

class EcommerceSettingsService extends BaseService {
  /** The workspace's settings, or the defaults when it never saved any. */
  async get(workspaceId: string): Promise<EcommerceSettings> {
    return await withCache(
      this.cacheTag(workspaceId),
      async () => {
        const row = await ecommerceSettingsRepository.find(workspaceId)
        return row ? toSettings(row) : ECOMMERCE_SETTINGS_DEFAULTS
      },
      { tags: [this.cacheTag(workspaceId)] },
    )
  }

  /** Read inside a transaction, past the cache. */
  async getFresh(
    workspaceId: string,
    tx?: DatabaseClient,
  ): Promise<EcommerceSettings> {
    const row = await ecommerceSettingsRepository.find(workspaceId, tx)
    return row ? toSettings(row) : ECOMMERCE_SETTINGS_DEFAULTS
  }

  /**
   * Which "Pro" settings the workspace may turn on. Every plan may for now;
   * this is the one place a plan check goes once Pro is defined.
   */
  resolveProFeatures(_workspaceId: string): Promise<EcommerceProFeatureAccess> {
    return Promise.resolve(
      Object.fromEntries(
        ecommerceProFeatures.options.map((feature) => [feature, true]),
      ) as EcommerceProFeatureAccess,
    )
  }

  /** Products priced in a currency other than the store's. */
  async countProductsInOtherCurrency(input: {
    workspaceId: string
    currency: string
  }): Promise<number> {
    return await ecommerceSettingsRepository.countProductsInOtherCurrency(input)
  }

  /**
   * Merges a partial update into the saved settings (or the defaults) and
   * saves the whole row. Each group may be sent alone.
   */
  async update(input: {
    workspaceId: string
    patch: EcommerceSettingsPatch
  }): Promise<EcommerceSettings> {
    const { workspaceId, patch } = input
    await this.assertProFeaturesAllowed(workspaceId, patch)

    const merged = await db.transaction(async (tx) => {
      // Create the row if missing, then lock it so two saves of different
      // groups queue up instead of overwriting each other's merge.
      await ecommerceSettingsRepository.insertIfMissing(
        { workspaceId, values: toValues(ECOMMERCE_SETTINGS_DEFAULTS) },
        tx,
      )
      const row = await ecommerceSettingsRepository.findForUpdate(
        workspaceId,
        tx,
      )
      const current = row ? toSettings(row) : ECOMMERCE_SETTINGS_DEFAULTS
      // A key sent as `undefined` keeps the saved value rather than erasing it.
      const next = ecommerceSettingsSchema.parse({
        general: { ...current.general, ...definedOnly(patch.general) },
        payments: { ...current.payments, ...definedOnly(patch.payments) },
        shipping: { ...current.shipping, ...definedOnly(patch.shipping) },
        checkout: { ...current.checkout, ...definedOnly(patch.checkout) },
      })
      await this.assertCoherent(workspaceId, next, patch)
      await ecommerceSettingsRepository.upsert(
        { workspaceId, values: toValues(next) },
        tx,
      )
      return next
    })

    await this.invalidateCacheTags(this.cacheTag(workspaceId))
    await this.audit("update", "updated ecommerce settings")
    return merged
  }

  private async assertProFeaturesAllowed(
    workspaceId: string,
    patch: EcommerceSettingsPatch,
  ) {
    const requested = enabledProFeatures(patch)
    if (requested.length === 0) {
      return
    }
    const access = await this.resolveProFeatures(workspaceId)
    const denied = requested.find((feature) => !access[feature])
    if (denied) {
      throw new ChatbotXException(
        `The ${denied} setting needs a Pro plan.`,
        "ecommerceProFeatureRequired",
        403,
      )
    }
  }

  private async assertCoherent(
    workspaceId: string,
    settings: EcommerceSettings,
    patch: EcommerceSettingsPatch,
  ) {
    const { checkout, shipping, general } = settings
    // A field the caller did not send stays as stored, so a flow deleted since
    // the last save must not block saving an unrelated group.
    const sent = {
      general: definedOnly(patch.general),
      shipping: definedOnly(patch.shipping),
      checkout: definedOnly(patch.checkout),
    }
    const touchesCheckoutTarget =
      "checkoutMode" in sent.checkout ||
      "checkoutLink" in sent.checkout ||
      "checkoutFlowId" in sent.checkout
    const touchesConfirmation =
      "orderConfirmationMode" in sent.checkout ||
      "orderConfirmationFlowId" in sent.checkout
    const touchesShipping = Object.keys(sent.shipping).length > 0
    if ("openHoursId" in sent.general && general.openHoursId) {
      await ecommerceOpenHoursService.assertBelongsToWorkspace({
        workspaceId,
        openHoursId: general.openHoursId,
      })
    }
    if (
      touchesCheckoutTarget &&
      checkout.checkoutMode === "externalLink" &&
      !checkout.checkoutLink
    ) {
      throw validationException(
        "checkoutLink",
        "A checkout link is required for the external link mode.",
      )
    }
    if (touchesCheckoutTarget && checkout.checkoutMode === "flow") {
      if (!checkout.checkoutFlowId) {
        throw validationException(
          "checkoutFlowId",
          "A checkout flow is required for the flow mode.",
        )
      }
      const exists = await flowService.exists(
        workspaceId,
        checkout.checkoutFlowId,
      )
      if (!exists) {
        throw validationException(
          "checkoutFlowId",
          "The checkout flow does not exist.",
        )
      }
    }
    if (touchesConfirmation && checkout.orderConfirmationMode === "flow") {
      if (!checkout.orderConfirmationFlowId) {
        throw validationException(
          "orderConfirmationFlowId",
          "An order confirmation flow is required for the flow mode.",
        )
      }
      if (
        !(await flowService.exists(
          workspaceId,
          checkout.orderConfirmationFlowId,
        ))
      ) {
        throw validationException(
          "orderConfirmationFlowId",
          "The order confirmation flow does not exist.",
        )
      }
    }
    if (
      "abandonedCartFlowId" in sent.general &&
      general.abandonedCartFlowId &&
      !(await flowService.exists(workspaceId, general.abandonedCartFlowId))
    ) {
      throw validationException(
        "abandonedCartFlowId",
        "The abandoned cart flow does not exist.",
      )
    }
    if (
      touchesShipping &&
      shipping.defaultShippingCountry &&
      shipping.shippingCountries.length > 0 &&
      !shipping.shippingCountries.includes(shipping.defaultShippingCountry)
    ) {
      throw validationException(
        "defaultShippingCountry",
        "The default shipping country must be one of the shipping countries.",
      )
    }
    const offersPickup =
      shipping.shippingType === "pickup" ||
      shipping.shippingType === "deliveryAndPickup"
    if (touchesShipping && offersPickup && !shipping.storeAddress) {
      throw validationException(
        "storeAddress",
        "A store address is required for pickup.",
      )
    }
  }

  private cacheTag(workspaceId: string) {
    return `ecommerce-settings:${workspaceId}`
  }
}

export const ecommerceSettingsService = new EcommerceSettingsService()
