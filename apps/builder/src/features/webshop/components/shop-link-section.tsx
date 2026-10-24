"use client"

import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { EyeIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { PublicUrlSection } from "@/components/public-url-section"

/**
 * The whole shop's link, like a Mini App's Public URL: copied into a flow,
 * broadcast or sequence button, its `{{shop_token}}` is signed for each
 * contact who gets it. Preview opens the shop as customers see it (it cannot
 * order). Both come from `webshop.getLink` without a contact. Rendered as the
 * bar pinned to the bottom of every Ecommerce page.
 */
export function ShopLinkSection({
  buttonUrl,
  previewUrl,
}: {
  buttonUrl: string
  previewUrl: string
}) {
  const t = useTranslations("webshopLinks")
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <PublicUrlSection
          hint={t("shopLink.hint")}
          label={t("shopLink.label")}
          publicUrl={buttonUrl}
        />
      </div>
      <a
        className={cn(
          buttonVariants({
            className: "flex-none",
            size: "sm",
            variant: "outline",
          }),
        )}
        href={previewUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        <EyeIcon />
        {t("preview")}
      </a>
    </div>
  )
}
