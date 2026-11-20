"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type ComponentProps, useState } from "react"
import { toast } from "sonner"

/**
 * Same-origin path of the private billing portal's session route. `/portal/*`
 * is routed to the portal in dev (rewrite) and prod (Caddy), so the user's
 * cookies flow and no enterprise code lands in this repo.
 */
const PORTAL_SESSION_PATH = "/portal/api/billing/portal-session"

/**
 * Past-due recovery: sends the user straight to the hosted billing portal to
 * fix their payment method, instead of the plan-upgrade dialog.
 */
export function UpdatePaymentButton({
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick">) {
  const t = useTranslations()
  const [loading, setLoading] = useState(false)

  const openPortal = async () => {
    setLoading(true)
    try {
      const res = await fetch(PORTAL_SESSION_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: window.location.href }),
      })
      const data = (await res.json().catch(() => ({}))) as { url?: string }
      if (!(res.ok && data.url)) {
        toast.error(t("billing.pastDue.portalError"))
        return
      }
      window.location.assign(data.url)
    } catch {
      toast.error(t("billing.pastDue.portalError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button disabled={loading} onClick={openPortal} type="button" {...props}>
      {loading && <Loader2Icon className="me-2 size-4 animate-spin" />}
      {children}
    </Button>
  )
}
