"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { RefreshCwIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { syncShopifyAction } from "../actions/sync-shopify.action"

type ProductSyncButtonProps = {
  workspaceId: string
  scope: "products" | "orders"
  label: string
}

/** Queues a Shopify sync of one scope, then refreshes the page's data. */
export function ProductSyncButton({
  workspaceId,
  scope,
  label,
}: ProductSyncButtonProps) {
  const t = useTranslations("products.shopify")
  const router = useRouter()
  const { execute, isPending } = useAction(
    syncShopifyAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("syncStarted"))
        router.refresh()
      },
      onError: toastActionError(t("syncError")),
    },
  )

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
