"use client"

import type {
  FulfillmentStatus,
  PaymentStatus,
} from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"

const PAYMENT_LABEL_KEYS = {
  paid: "orders.paymentStatuses.paid",
  unpaid: "orders.shopify.paymentPending",
  refunded: "orders.paymentStatuses.refunded",
} as const satisfies Record<PaymentStatus, string>

const PAYMENT_CLASSES = {
  paid: "border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  unpaid:
    "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  refunded:
    "border-transparent bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
} as const satisfies Record<PaymentStatus, string>

const FULFILLMENT_LABEL_KEYS = {
  fulfilled: "orders.shopify.fulfillmentStatuses.fulfilled",
  unfulfilled: "orders.shopify.fulfillmentStatuses.unfulfilled",
  partial: "orders.shopify.fulfillmentStatuses.partial",
} as const satisfies Record<FulfillmentStatus, string>

const FULFILLMENT_CLASSES = {
  fulfilled:
    "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  unfulfilled: "text-muted-foreground",
  partial:
    "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
} as const satisfies Record<FulfillmentStatus, string>

type OrderExternalStatusBadgesProps = {
  paymentStatus: PaymentStatus
  fulfillmentStatus: FulfillmentStatus | null
}

/** A mirrored order's payment badge, and its fulfillment badge when known. */
export function OrderExternalStatusBadges({
  paymentStatus,
  fulfillmentStatus,
}: OrderExternalStatusBadgesProps) {
  const t = useTranslations()
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge className={cn(PAYMENT_CLASSES[paymentStatus])} variant="outline">
        {t(PAYMENT_LABEL_KEYS[paymentStatus])}
      </Badge>
      {fulfillmentStatus ? (
        <Badge
          className={cn(FULFILLMENT_CLASSES[fulfillmentStatus])}
          variant="outline"
        >
          {t(FULFILLMENT_LABEL_KEYS[fulfillmentStatus])}
        </Badge>
      ) : null}
    </span>
  )
}
