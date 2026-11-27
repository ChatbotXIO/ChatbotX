"use client"

import { useTranslations } from "next-intl"
import { useCallback } from "react"
import type { ShopActionError } from "../lib/shop-action-types"
import { formatShopMoney, type ShopMoneyFormat } from "../lib/shop-money"

// Codes the shop has its own sentence for; anything else reads as generic.
const KNOWN_CODES = new Set([
  "invalidLink",
  "webshopPreviewOnly",
  "rateLimited",
  "orderingUnavailable",
  "orderBelowMinimum",
  "orderBelowVendorMinimum",
  "orderOutOfStock",
  "orderProductUnavailable",
  "orderEmpty",
  "orderShippingTypeUnavailable",
  "webshopRatingNotAllowed",
  "webshopCartFull",
  "notFound",
  "discountCodeNotFound",
  "discountCodeInactive",
  "discountCodeNotStarted",
  "discountCodeExpired",
  "discountCodeUsageLimitReached",
  "discountCodeAlreadyUsed",
  "discountCodeNotEligible",
  "discountCodeNotApplicable",
  "paymentMethodUnavailable",
  "paymentProviderNotConnected",
  "paymentProviderUnavailable",
  "paymentProviderRejected",
  "paymentProviderCredentialsRejected",
  "paymentAmountUnsupported",
  "orderPaymentNotOpen",
])

const FIELD_LABEL_KEYS: Record<string, string> = {
  customerName: "name",
  customerEmail: "email",
  customerPhone: "phone",
  "shippingAddress.line1": "address1",
  "shippingAddress.state": "state",
  "shippingAddress.zip": "zip",
  "shippingAddress.country": "country",
}

/** The customer's sentence for a refused shop action. */
export function useShopErrorMessage(money: ShopMoneyFormat) {
  const t = useTranslations("webshop")
  return useCallback(
    (error: ShopActionError | undefined): string => {
      if (!error) {
        return t("errors.generic")
      }
      const data = error.data ?? {}
      const amount = (value: unknown) =>
        typeof value === "number" ? formatShopMoney(value, money) : ""
      if (error.code === "webshopClosed") {
        return data.reason === "outsideOpenHours"
          ? t("closed.outsideOpenHours")
          : t("closed.orderingUnavailable")
      }
      if (error.code === "validation") {
        if (error.field === "shippingAddress.country") {
          return t("errors.countryUnavailable")
        }
        const labelKey = error.field ? FIELD_LABEL_KEYS[error.field] : undefined
        return labelKey
          ? t("errors.fieldRequired", { field: t(`fields.${labelKey}`) })
          : t("errors.generic")
      }
      if (error.code === "discountCodeMinimumNotMet") {
        return data.minimumType === "quantity"
          ? t("errors.discountCodeMinimumQuantity", {
              minimum: Number(data.minimum ?? 0),
              missing: Number(data.missing ?? 0),
            })
          : t("errors.discountCodeMinimumAmount", {
              minimum: amount(data.minimum),
              missing: amount(data.missing),
            })
      }
      if (!KNOWN_CODES.has(error.code)) {
        return t("errors.generic")
      }
      return t(`errors.${error.code}`, {
        minimum: amount(data.minimum),
        maximum: Number(data.maximum ?? 0),
        vendorName: String(data.vendorName ?? ""),
        productName: String(data.productName ?? ""),
      })
    },
    [money, t],
  )
}
