"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { cancelBookingAction } from "@/app/booking/cancel/action"

export function CancelAppointmentPanel({ token }: { token: string }) {
  const t = useTranslations("bookingWebview.cancel")
  const [status, setStatus] = useState<"idle" | "cancelled" | "unavailable">(
    "idle",
  )
  const { execute, isPending } = useAction(cancelBookingAction, {
    onSuccess: ({ data }) => {
      setStatus(data?.cancellable ? "cancelled" : "unavailable")
    },
    onError: () => setStatus("unavailable"),
  })

  if (status === "cancelled") {
    return (
      <div className="rounded-md border bg-muted/40 p-4 text-sm">
        <p className="font-medium">{t("cancelledTitle")}</p>
        <p className="text-muted-foreground">{t("cancelledDescription")}</p>
      </div>
    )
  }

  if (status === "unavailable") {
    return (
      <div className="rounded-md border bg-muted/40 p-4 text-sm">
        <p className="font-medium">{t("unavailableTitle")}</p>
        <p className="text-muted-foreground">{t("unavailableDescription")}</p>
      </div>
    )
  }

  return (
    <Button
      disabled={isPending}
      onClick={() => execute({ token })}
      type="button"
      variant="destructive"
    >
      {isPending ? <Loader2Icon className="animate-spin" /> : null}
      {t("action")}
    </Button>
  )
}
