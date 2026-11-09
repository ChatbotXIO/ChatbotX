"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  LayoutGridIcon,
  LinkIcon,
  type LucideIcon,
  ShoppingCartIcon,
  StoreIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"

/** Bot-button links (`{{shop_token}}` signed per contact) to three shop pages. */
export type ShopButtonLinks = {
  shop: string
  cart: string
  categories: string
}

/** How long the copy button shows its check mark. */
const COPIED_FEEDBACK_MS = 2000

/** One link of the dialog: what it opens, the link and its Copy button. */
function ShopLinkRow({
  icon: Icon,
  label,
  hint,
  url,
}: {
  icon: LucideIcon
  label: string
  hint: string
  url: string
}) {
  const t = useTranslations()
  const [, copy] = useCopyToClipboard()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) {
      return
    }
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const handleCopy = () => {
    copy(url)
      .then(() => {
        setCopied(true)
        toast.success(t("webshopLinks.copied"))
      })
      .catch(() => {
        toast.error(t("webshopLinks.copyError"))
      })
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 flex-none items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-sm leading-none">{label}</p>
          <p className="text-muted-foreground text-xs">{hint}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Input
          aria-label={label}
          className="min-w-0 flex-1 bg-muted/40 font-mono text-xs"
          onFocus={(event) => event.currentTarget.select()}
          readOnly
          value={url}
        />
        <Button
          aria-label={t("actions.copyUrl")}
          className="w-24 flex-none"
          onClick={handleCopy}
          type="button"
          variant="outline"
        >
          {copied ? <CheckIcon className="text-primary" /> : <CopyIcon />}
          {t("actions.copy")}
        </Button>
      </div>
    </div>
  )
}

/**
 * The shop's links, like a Mini App's Public URL: copied into a flow,
 * broadcast or sequence button, each `{{shop_token}}` is signed for each
 * contact who gets it. "Get link" lists the shop, cart and categories links;
 * Preview opens the shop as customers see it (it cannot order). All come from
 * `webshop.getLink` without a contact. Rendered as the bar pinned to the
 * bottom of every Ecommerce page.
 */
export function ShopLinkSection({
  buttonUrls,
  previewUrl,
}: {
  buttonUrls: ShopButtonLinks
  previewUrl: string
}) {
  const t = useTranslations("webshopLinks")
  const [open, setOpen] = useState(false)
  const links = [
    {
      key: "shop",
      icon: StoreIcon,
      label: t("shopLink.label"),
      hint: t("dialog.shopHint"),
      url: buttonUrls.shop,
    },
    {
      key: "cart",
      icon: ShoppingCartIcon,
      label: t("cartLink.label"),
      hint: t("cartLink.hint"),
      url: buttonUrls.cart,
    },
    {
      key: "categories",
      icon: LayoutGridIcon,
      label: t("categoriesLink.label"),
      hint: t("categoriesLink.hint"),
      url: buttonUrls.categories,
    },
  ]

  return (
    <div className="flex items-center gap-3">
      <p className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
        {t("bar")}
      </p>
      <Button
        className="flex-none"
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
      >
        <LinkIcon />
        {t("getLink")}
      </Button>
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
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("dialog.title")}</DialogTitle>
            <DialogDescription>{t("dialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="divide-y overflow-hidden rounded-lg border">
            {links.map((link) => (
              <ShopLinkRow
                hint={link.hint}
                icon={link.icon}
                key={link.key}
                label={link.label}
                url={link.url}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
