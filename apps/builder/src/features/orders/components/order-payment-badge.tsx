"use client"

import {
  isOnlinePaymentMethod,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  BanknoteIcon,
  CreditCardIcon,
  type LucideIcon,
  WalletIcon,
} from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"

/** Where an order's money stands, as one word a member reads at a glance. */
type PaymentState =
  | "paid"
  | "refunded"
  | "awaitingPayment"
  | "payOnDelivery"
  | "notPaid"

type OrderPayment = {
  status: OrderStatus
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  paymentExpiresAt: Date | string | null
}

const paymentState = (order: OrderPayment): PaymentState => {
  if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") {
    return order.paymentStatus
  }
  if (order.status === "cancelled") {
    return "notPaid"
  }
  return isOnlinePaymentMethod(order.paymentMethod)
    ? "awaitingPayment"
    : "payOnDelivery"
}

const STATE_CLASSES: Record<PaymentState, string> = {
  paid: "border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  refunded:
    "border-transparent bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  awaitingPayment:
    "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  payOnDelivery: "text-muted-foreground",
  notPaid: "text-muted-foreground",
}

const METHOD_ICONS: Record<PaymentMethod, LucideIcon> = {
  cod: BanknoteIcon,
  stripe: CreditCardIcon,
  paypal: WalletIcon,
}

/**
 * The order's payment: a coloured state (paid, waiting for an online payment
 * and until when, pay on delivery, not paid, refunded) over how it is paid.
 */
export function OrderPaymentBadge({
  order,
  showMethod = true,
}: {
  order: OrderPayment
  showMethod?: boolean
}) {
  const t = useTranslations("orders")
  const format = useFormatter()
  const state = paymentState(order)
  const MethodIcon = METHOD_ICONS[order.paymentMethod]
  const deadline =
    state === "awaitingPayment" && order.paymentExpiresAt
      ? format.dateTime(new Date(order.paymentExpiresAt), {
          timeStyle: "short",
        })
      : null

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Badge className={cn(STATE_CLASSES[state])} variant="outline">
        {t(`paymentStates.${state}`)}
        {deadline ? ` · ${t("paymentUntil", { time: deadline })}` : null}
      </Badge>
      {showMethod ? (
        <span className="flex items-center gap-1 text-muted-foreground text-xs">
          <MethodIcon className="size-3.5" />
          {t(`paymentMethods.${order.paymentMethod}`)}
        </span>
      ) : null}
    </span>
  )
}
