"use client"

import {
  ORDER_STATUS_TRANSITIONS,
  type OrderStatus,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import {
  cancelOrderAction,
  transitionOrderAction,
} from "../actions/transition-order.action"
import type { TransitionOrderRequest } from "../schema/action"

type TargetStatus = TransitionOrderRequest["to"] | "cancelled"

/** Button order on the page: the next step first, cancelling last. */
const ACTION_ORDER: TargetStatus[] = [
  "accepted",
  "shipped",
  "concluded",
  "cancelled",
]

type OrderStatusActionsProps = {
  workspaceId: string
  orderId: string
  status: OrderStatus
  /** An online order whose money has not come in: it cannot be accepted yet. */
  awaitingPayment: boolean
  /** What cancelling refunds (formatted), when the order was paid online. */
  refundAmount: string | null
}

/**
 * The buttons the order's status allows. Each opens "Update order status",
 * whose optional message goes to the customer and onto the order's history.
 */
export function OrderStatusActions({
  workspaceId,
  orderId,
  status,
  awaitingPayment,
  refundAmount,
}: OrderStatusActionsProps) {
  const t = useTranslations("orders")
  const router = useRouter()
  const [target, setTarget] = useState<TargetStatus | null>(null)
  const [message, setMessage] = useState("")
  const allowed = ORDER_STATUS_TRANSITIONS[status] as readonly OrderStatus[]
  const targets = ACTION_ORDER.filter(
    (next) =>
      allowed.includes(next) && !(awaitingPayment && next === "accepted"),
  )

  const callbacks = {
    onSuccess: () => {
      toast.success(t("statusUpdated"))
      setTarget(null)
      setMessage("")
      router.refresh()
    },
    onError: toastActionError(t("statusUpdateError")),
  }
  const transition = useAction(
    transitionOrderAction.bind(null, workspaceId, orderId),
    callbacks,
  )
  // Its own action: cancelling stays allowed once the trial expired.
  const cancel = useAction(
    cancelOrderAction.bind(null, workspaceId, orderId),
    callbacks,
  )
  const isPending = transition.isPending || cancel.isPending
  const submit = (next: TargetStatus) => {
    const note = message.trim() || null
    if (next === "cancelled") {
      cancel.execute({ message: note })
    } else {
      transition.execute({ to: next, message: note })
    }
  }

  if (targets.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 print:hidden">
      {awaitingPayment ? (
        <p className="w-full text-center text-muted-foreground text-sm">
          {t("awaitingPaymentHint")}
        </p>
      ) : null}
      {targets.map((next) => (
        <Button
          disabled={isPending}
          key={next}
          onClick={() => setTarget(next)}
          variant={next === "cancelled" ? "destructive" : "outline"}
        >
          {t(`transitions.${next}`)}
        </Button>
      ))}

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null)
          }
        }}
        open={target !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("updateStatusTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="order-status-message">{t("message")}</Label>
            <Textarea
              id="order-status-message"
              maxLength={1000}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t("messagePlaceholder")}
              value={message}
            />
            <p className="text-muted-foreground text-xs">
              {t("messageDescription")}
            </p>
            {target === "cancelled" && refundAmount ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                {t("refundWarning", { amount: refundAmount })}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline">{t("cancel")}</Button>}
            />
            <Button
              disabled={isPending || target === null}
              onClick={() => {
                if (target) {
                  submit(target)
                }
              }}
            >
              {t("continue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
