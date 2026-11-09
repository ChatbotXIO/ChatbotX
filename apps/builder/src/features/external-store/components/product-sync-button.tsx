"use client"

import type { ExternalStoreSource } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { RefreshCwIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { syncShopifyAction } from "@/features/shopify/actions/sync-shopify.action"
import { syncWooCommerceAction } from "@/features/woocommerce/actions/sync-woocommerce.action"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"

type ProductSyncButtonProps = {
  workspaceId: string
  source: ExternalStoreSource
  scope: "products" | "orders"
  label: string
}

/** Queues a sync of the connected store, one scope, then refreshes the page's data. */
export function ProductSyncButton({
  workspaceId,
  source,
  scope,
  label,
}: ProductSyncButtonProps) {
  const t = useTranslations("products.shopify")
  const router = useRouter()
  const callbacks = {
    onSuccess: () => {
      toast.success(t("syncStarted"))
      router.refresh()
    },
    onError: toastActionError(t("syncError")),
  }
  // Both hooks always run; the store's own one is used.
  const shopifySync = useAction(
    syncShopifyAction.bind(null, workspaceId),
    callbacks,
  )
  const wooCommerceSync = useAction(
    syncWooCommerceAction.bind(null, workspaceId),
    callbacks,
  )
  const { execute, isPending } =
    source === "shopify" ? shopifySync : wooCommerceSync

  return (
    <Button
      className="bg-blue-600 text-white hover:bg-blue-700"
      disabled={isPending}
      onClick={() => execute({ scope })}
      size="sm"
    >
      <RefreshCwIcon className={isPending ? "animate-spin" : undefined} />
      {label}
    </Button>
  )
}
