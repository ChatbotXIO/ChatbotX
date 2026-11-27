import { db } from "@chatbotx.io/database/client"
import type {
  EcommerceCheckoutSettings,
  EcommerceGeneralSettings,
  EcommercePaymentSettings,
  EcommerceShippingSettings,
} from "@chatbotx.io/database/partials"
import { ecommerceSettingsRepository } from "@chatbotx.io/database/repositories"
import type { ecommerceSettingsModel } from "@chatbotx.io/database/schema"
import { ecommerceSettingsService } from "../../ecommerce-settings/service"
import { withoutExternalStore } from "./external-store-collector"
import {
  makeCollector,
  recordCopy,
  scopedWhere,
  updateNotSupported,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  TemplateInstallContext,
} from "./types"

/**
 * What of the store's configuration travels: the general, currency, shipping
 * and checkout choices. Payment methods, the Facebook pixel, the store source
 * and the external-checkout options are the installer's.
 */
type TemplateStoreSettingsEntry = {
  sourceId: string
  general: Omit<EcommerceGeneralSettings, "storeSource" | "facebookPixelId">
  payments: Omit<EcommercePaymentSettings, "paymentMethods">
  shipping: EcommerceShippingSettings
  checkout: Omit<
    EcommerceCheckoutSettings,
    "externalCheckoutMethod" | "externalAutoApplyDiscounts"
  >
}

/**
 * What a template does with every column of `EcommerceSettings` (one row per workspace).
 */
export const STORE_SETTINGS_COLUMNS = {
  id: "reset",
  createdAt: "reset",
  updatedAt: "reset",
  workspaceId: "reset",
  // The installer's own.
  storeSource: "drop",
  orderingAvailable: "copy",
  webshopProductView: "copy",
  openHoursId: "reference",
  searchProducts: "copy",
  // The installer's own.
  facebookPixelId: "drop",
  abandonedCartDelayMinutes: "copy",
  abandonedCartFlowId: "reference",
  productButtons: "copy",
  productImageSize: "copy",
  allowRateOrders: "copy",
  notifyOnCartStatusChange: "copy",
  // The installer's own.
  paymentMethods: "drop",
  currency: "copy",
  currencyPosition: "copy",
  currencySymbol: "copy",
  serviceFeePercent: "copy",
  shippingType: "copy",
  storeAddress: "copy",
  shippingCountries: "copy",
  defaultShippingCountry: "copy",
  deliveryCost: "copy",
  checkoutMode: "copy",
  checkoutLink: "copy",
  checkoutFlowId: "reference",
  minimumOrderValue: "copy",
  orderConfirmationMode: "copy",
  orderConfirmationFlowId: "reference",
  requireName: "copy",
  requireEmail: "copy",
  requirePhone: "copy",
  requireState: "copy",
  requireZip: "copy",
  // The installer's own.
  externalCheckoutMethod: "drop",
  // The installer's own.
  externalAutoApplyDiscounts: "drop",
} as const satisfies Record<
  keyof typeof ecommerceSettingsModel.$inferSelect,
  "copy" | "reset" | "drop" | "rebind" | "reference"
>

/**
 * The store settings are one row per workspace, so the copy is insert-if-missing:
 * a workspace that already has settings keeps them, with a `storeSettingsKept`
 * warning. Installs after the flows, since a checkout or confirmation flow that
 * did not come along falls back to the default mode instead of a missing flow.
 * Uninstall keeps this row (after an install it also holds what the installer
 * entered and configures a store that may be taking orders).
 */
export const storeSettingsAdapter: ResourceAdapter<TemplateStoreSettingsEntry> =
  {
    category: "storeSettings",
    providesKinds: ["storeSettings"],
    consumesKinds: ["openHours", "flow"],
    deferredKinds: [],
    trackedKind: "storeSettings",
    folderTypes: [],
    minFormatVersion: 3,
    sync: updateNotSupported("storeSettings"),

    async insert(
      ctx: TemplateInstallContext,
      entries: readonly TemplateStoreSettingsEntry[],
    ): Promise<PatchTask[]> {
      for (const entry of entries) {
        const existing = await ecommerceSettingsRepository.find(
          ctx.workspaceId,
          ctx.tx,
        )
        if (existing) {
          ctx.warn({
            category: "storeSettings",
            entityKind: "storeSettingsKept",
            path: `storeSettings.${entry.sourceId}`,
            value: entry.sourceId,
          })
          recordCopy(ctx, {
            category: "storeSettings",
            resourceKind: "storeSettings",
            sourceId: entry.sourceId,
            resourceId: existing.id,
            wasExisting: true,
          })
          continue
        }
        // The currency a store prices in is written only while no product is
        // priced in another one; otherwise the installer's currency stays.
        const { currency, currencyPosition, currencySymbol, ...otherPayments } =
          entry.payments
        const productsInOtherCurrency =
          await ecommerceSettingsRepository.countProductsInOtherCurrency(
            { workspaceId: ctx.workspaceId, currency },
            ctx.tx,
          )
        if (productsInOtherCurrency > 0) {
          ctx.warn({
            category: "storeSettings",
            entityKind: "storeSettingsCurrencyKept",
            path: `storeSettings.${entry.sourceId}.payments.currency`,
            value: currency,
          })
        }
        const flow = (id: string | null) =>
          id ? (ctx.idMaps.flow?.get(id) ?? null) : null
        const checkoutFlowId = flow(entry.checkout.checkoutFlowId)
        const orderConfirmationFlowId = flow(
          entry.checkout.orderConfirmationFlowId,
        )
        const values = await ecommerceSettingsService.prepareTemplateValues(
          ctx.workspaceId,
          {
            general: {
              ...entry.general,
              openHoursId: entry.general.openHoursId
                ? (ctx.idMaps.openHours?.get(entry.general.openHoursId) ?? null)
                : null,
              abandonedCartFlowId: flow(entry.general.abandonedCartFlowId),
            },
            payments:
              productsInOtherCurrency > 0
                ? otherPayments
                : {
                    ...otherPayments,
                    currency,
                    currencyPosition,
                    currencySymbol,
                  },
            shipping: entry.shipping,
            checkout: {
              ...entry.checkout,
              checkoutFlowId,
              orderConfirmationFlowId,
              // A mode that names a flow needs it: without it, the default.
              checkoutMode:
                entry.checkout.checkoutMode === "flow" && !checkoutFlowId
                  ? "default"
                  : entry.checkout.checkoutMode,
              orderConfirmationMode:
                entry.checkout.orderConfirmationMode === "flow" &&
                !orderConfirmationFlowId
                  ? "default"
                  : entry.checkout.orderConfirmationMode,
            },
          },
        )
        const { row, created } = await ecommerceSettingsRepository.insertOrFind(
          { workspaceId: ctx.workspaceId, values },
          ctx.tx,
        )
        if (!row) {
          continue
        }
        // Another writer created the row after the check above: it is theirs.
        if (!created) {
          ctx.warn({
            category: "storeSettings",
            entityKind: "storeSettingsKept",
            path: `storeSettings.${entry.sourceId}`,
            value: entry.sourceId,
          })
        }
        recordCopy(ctx, {
          category: "storeSettings",
          resourceKind: "storeSettings",
          sourceId: entry.sourceId,
          resourceId: row.id,
          ...(created ? {} : { wasExisting: true }),
        })
      }
      return [] satisfies PatchTask[]
    },

    collector: withoutExternalStore(
      makeCollector({
        findIds: (query) =>
          db.query.ecommerceSettingsModel.findMany({
            where: scopedWhere({
              workspaceId: query.workspaceId,
              ids: query.ids,
            }),
            columns: { id: true },
            limit: query.limit,
          }),

        async collectRows(workspaceId, ids) {
          const rows = await db.query.ecommerceSettingsModel.findMany({
            where: scopedWhere({ workspaceId, ids }),
          })
          return {
            entries: rows.map(
              (row): TemplateStoreSettingsEntry => ({
                sourceId: row.id,
                general: {
                  orderingAvailable: row.orderingAvailable,
                  webshopProductView: row.webshopProductView,
                  openHoursId: row.openHoursId,
                  searchProducts: row.searchProducts,
                  abandonedCartDelayMinutes: row.abandonedCartDelayMinutes,
                  abandonedCartFlowId: row.abandonedCartFlowId,
                  productButtons: row.productButtons,
                  productImageSize: row.productImageSize,
                  allowRateOrders: row.allowRateOrders,
                  notifyOnCartStatusChange: row.notifyOnCartStatusChange,
                },
                payments: {
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
              }),
            ),
            hardDependencies: [
              ...rows.flatMap((row) =>
                row.openHoursId
                  ? [
                      {
                        category: "openHours" as const,
                        sourceId: row.openHoursId,
                      },
                    ]
                  : [],
              ),
              ...rows.flatMap((row) =>
                [
                  row.abandonedCartFlowId,
                  row.checkoutFlowId,
                  row.orderConfirmationFlowId,
                ].flatMap((flowId) =>
                  flowId
                    ? [{ category: "flows" as const, sourceId: flowId }]
                    : [],
                ),
              ),
            ],
          }
        },
      }),
    ),
  }
