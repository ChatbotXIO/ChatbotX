"use client"

import { DropdownMenuItem } from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { EyeIcon, LinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { getWebshopLinksAction } from "../actions/get-webshop-links.action"

/**
 * "Preview" opens the shop page of a product, vendor or category as customers
 * see it; "Get Link" copies the link to put on a bot button, which carries
 * `{{shop_token}}` so each contact shops as themselves.
 */
export function WebshopLinkMenuItems({
  workspaceId,
  target,
}: {
  workspaceId: string
  target: { productId: string } | { vendorId: string } | { categoryId: string }
}) {
  const t = useTranslations("webshopLinks")
  const { executeAsync, isPending } = useAction(
    getWebshopLinksAction.bind(null, workspaceId),
  )

  const fetchLinks = async () => {
    const result = await executeAsync(target)
    if (!result?.data) {
      toast.error(t("error"))
      return null
    }
    return result.data
  }

  const preview = async () => {
    // Opened before the request so the browser does not block the tab.
    const tab = window.open("about:blank", "_blank")
    const links = await fetchLinks()
    if (!links) {
      tab?.close()
      return
    }
    if (tab) {
      tab.opener = null
      tab.location.href = links.previewUrl
    } else {
      window.location.href = links.previewUrl
    }
  }

  const copyLink = async () => {
    const links = await fetchLinks()
    if (!links) {
      return
    }
    try {
      await navigator.clipboard.writeText(links.buttonUrl)
      toast.success(t("copied"))
    } catch {
      toast.error(t("copyError"))
    }
  }

  return (
    <>
      <DropdownMenuItem disabled={isPending} onClick={preview}>
        <EyeIcon className="me-2 h-4 w-4" />
        {t("preview")}
      </DropdownMenuItem>
      <DropdownMenuItem disabled={isPending} onClick={copyLink}>
        <LinkIcon className="me-2 h-4 w-4" />
        {t("getLink")}
      </DropdownMenuItem>
    </>
  )
}
