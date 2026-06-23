"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { CrownIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ComponentProps, useEffect, useState } from "react"
import { reconcileTenantEntitlementAction } from "./actions/reconcile-tenant-entitlement.action"

/**
 * Same-origin path proxied to the private billing portal (see
 * apps/builder/next.config.ts). We embed it in an iframe so all pricing and
 * plan-detail logic stays in the portal and never lands in this repo.
 *
 * Must stay relative (same-origin) so the user's session cookies flow into the
 * iframe and framing is not blocked by X-Frame-Options.
 */
const PRICING_PATH = "/pricing"

/** Message the portal posts on a successful upgrade so we can refresh in-app. */
const UPGRADE_SUCCESS_TYPE = "billing:upgrade-success"

export function UpgradePlanDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const router = useRouter()
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    if (!open) {
      setIsLoaded(false)
      return
    }

    const handleMessage = (event: MessageEvent) => {
      // The portal is proxied same-origin; ignore anything else.
      if (event.origin !== window.location.origin) {
        return
      }

      if (
        event.data &&
        typeof event.data === "object" &&
        event.data.type === UPGRADE_SUCCESS_TYPE
      ) {
        onOpenChange(false)
        // Provision the reseller's tenant immediately on a white-label upgrade.
        // Best-effort: refresh regardless so a reconcile failure never blocks
        // the UI — the worker reconcile is the authority and catches any miss.
        reconcileTenantEntitlementAction()
          .catch(() => undefined)
          .finally(() => router.refresh())
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [open, onOpenChange, router])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex h-[85vh] w-[min(95vw,1100px)] max-w-none flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2">
            <CrownIcon aria-hidden className="size-4 text-primary" />
            {t("actions.upgradePlan")}
          </DialogTitle>
        </DialogHeader>
        <div className="relative flex-1">
          {!isLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <Loader2Icon
                aria-hidden
                className="size-6 animate-spin text-muted-foreground"
              />
            </div>
          )}
          {open && (
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onLoad only tracks iframe load state for the spinner; the iframe is not interactive itself.
            <iframe
              className="size-full border-0"
              onLoad={() => setIsLoaded(true)}
              src={PRICING_PATH}
              title={t("actions.upgradePlan")}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Self-contained trigger that owns its own open state. Use at call sites that
 * can't hold React state (e.g. async server components). Children render inside
 * the button so each call site keeps its own label/icon.
 */
export function UpgradePlanButton({
  children,
  ...props
}: ComponentProps<typeof Button>) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)} type="button" {...props}>
        {children}
      </Button>
      <UpgradePlanDialog onOpenChange={setOpen} open={open} />
    </>
  )
}
