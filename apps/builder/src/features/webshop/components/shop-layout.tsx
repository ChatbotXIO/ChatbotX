import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { EyeIcon, ShoppingCartIcon, StoreIcon } from "lucide-react"
import Link from "next/link"
import Script from "next/script"
import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import type { ShopView } from "../lib/load-shop"
import { shopHref } from "../lib/shop-href"
import type { ShopSession } from "../lib/shop-session"
import { FacebookPixel } from "./facebook-pixel"
import { ShopProvider } from "./shop-provider"

/**
 * Every shop page: the store's name, the cart, a banner when it is a preview
 * or the store is closed, and the shop context the client parts read.
 */
export async function ShopLayout({
  workspaceId,
  session,
  shop,
  cartCount,
  children,
}: {
  workspaceId: string
  session: ShopSession
  shop: ShopView
  cartCount: number
  children: ReactNode
}) {
  const t = await getTranslations("webshop")
  const preview = session.mode === "preview"
  const closedReason = shop.ordering.open ? null : shop.ordering.reason
  return (
    <ShopProvider
      value={{
        workspaceId,
        token: session.token,
        money: shop.money,
        preview,
        open: shop.ordering.open,
        checkoutMode: shop.checkout.mode,
        productButtons: shop.productButtons,
      }}
    >
      {/* Lets the order page close Messenger's in-app browser. */}
      <Script
        src="https://connect.facebook.net/en_US/messenger.Extensions.js"
        strategy="afterInteractive"
      />
      <FacebookPixel pixelId={shop.facebookPixelId} />
      <div className="min-h-screen bg-muted/40">
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
            <Link
              className="flex min-w-0 items-center gap-2 font-semibold"
              href={shopHref(workspaceId, session.token)}
            >
              <StoreIcon className="size-5 shrink-0" />
              <span className="truncate">{shop.storeName}</span>
            </Link>
            {preview ? null : (
              <Link
                aria-label={t("cart")}
                className="relative flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted"
                href={shopHref(workspaceId, session.token, "/cart")}
              >
                <ShoppingCartIcon className="size-5" />
                <span className="hidden sm:inline">{t("cart")}</span>
                {cartCount > 0 ? (
                  <Badge className="h-5 min-w-5 px-1.5">{cartCount}</Badge>
                ) : null}
              </Link>
            )}
          </div>
        </header>
        {preview ? (
          <div className="border-b bg-amber-50 px-4 py-2 text-amber-900 text-sm dark:bg-amber-950 dark:text-amber-100">
            <div className="mx-auto flex max-w-3xl items-center gap-2">
              <EyeIcon className="size-4 shrink-0" />
              {t("previewBanner")}
            </div>
          </div>
        ) : null}
        {closedReason ? (
          <div className="border-b bg-muted px-4 py-2 text-sm">
            <div className="mx-auto max-w-3xl">
              {t(`closed.${closedReason}`)}
            </div>
          </div>
        ) : null}
        <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>
      </div>
    </ShopProvider>
  )
}

/** The page a broken, expired or foreign link lands on. */
export async function ShopInvalidLink() {
  const t = await getTranslations("webshop")
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="font-semibold text-2xl">{t("invalidLinkTitle")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("invalidLinkDescription")}
        </p>
      </div>
    </div>
  )
}
