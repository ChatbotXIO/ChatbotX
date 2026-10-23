import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import {
  ClockIcon,
  EyeIcon,
  LinkIcon,
  ShoppingCartIcon,
  StoreIcon,
} from "lucide-react"
import Link from "next/link"
import Script from "next/script"
import { NextIntlClientProvider } from "next-intl"
import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { loadWorkspaceMessages } from "@/i18n/workspace-locale"
import type { ShopView } from "../lib/load-shop"
import { shopBrandStyle } from "../lib/shop-brand-style"
import { shopHref } from "../lib/shop-href"
import { getShopTranslations } from "../lib/shop-page"
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
  const t = await getShopTranslations(shop)
  // The client parts read the workspace language too, not the viewer's cookie.
  const { locale, messages } = loadWorkspaceMessages(shop.locale)
  const preview = session.mode === "preview"
  const closedReason = shop.ordering.open ? null : shop.ordering.reason
  // The workspace's brand color drives every primary-colored part of the shop.
  const brandColorStyle = shopBrandStyle(shop.brandColor)
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ShopProvider
        value={{
          workspaceId,
          token: session.token,
          money: shop.money,
          preview,
          open: shop.ordering.open,
          checkoutMode: shop.checkout.mode,
          productButtons: shop.productButtons,
          brandColorStyle,
        }}
      >
        {/* Lets the order page close Messenger's in-app browser. */}
        <Script
          src="https://connect.facebook.net/en_US/messenger.Extensions.js"
          strategy="afterInteractive"
        />
        {/* A merchant's preview is not a customer visit for the Pixel. */}
        <FacebookPixel pixelId={preview ? null : shop.facebookPixelId} />
        <div
          className="min-h-screen bg-gradient-to-b from-muted/60 to-muted/20"
          lang={locale}
          style={brandColorStyle}
        >
          <header className="sticky top-0 z-10 border-b bg-background/80 shadow-xs backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
              <Link
                className="group flex min-w-0 items-center gap-2.5 font-semibold text-lg"
                href={shopHref(workspaceId, session.token)}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform duration-200 group-hover:scale-105">
                  <StoreIcon className="size-5" />
                </span>
                <span className="truncate">{shop.storeName}</span>
              </Link>
              <Link
                aria-label={t("cart")}
                className="relative flex items-center gap-2 rounded-full border bg-background px-3.5 py-2 font-medium text-sm shadow-xs transition-colors hover:bg-muted active:scale-95"
                href={shopHref(workspaceId, session.token, "/cart")}
              >
                <ShoppingCartIcon className="size-4" />
                <span className="hidden sm:inline">{t("cart")}</span>
                {cartCount > 0 ? (
                  <Badge
                    className="zoom-in-50 absolute -top-1.5 -right-1.5 h-5 min-w-5 animate-in px-1.5 tabular-nums shadow-sm duration-300"
                    // A new count pops in again.
                    key={cartCount}
                  >
                    {cartCount}
                  </Badge>
                ) : null}
              </Link>
            </div>
          </header>
          {preview ? (
            <div className="border-b bg-amber-50 px-4 py-2 text-amber-900 text-sm dark:bg-amber-950 dark:text-amber-100">
              <div className="mx-auto flex max-w-5xl items-center gap-2">
                <EyeIcon className="size-4 shrink-0" />
                {t("previewBanner")}
              </div>
            </div>
          ) : null}
          {closedReason ? (
            <div className="border-b bg-muted px-4 py-2 text-sm">
              <div className="mx-auto flex max-w-5xl items-center gap-2">
                <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
                {t(`closed.${closedReason}`)}
              </div>
            </div>
          ) : null}
          <main className="fade-in slide-in-from-bottom-1 mx-auto max-w-5xl animate-in px-4 py-5 duration-300 motion-reduce:animate-none">
            {children}
          </main>
        </div>
      </ShopProvider>
    </NextIntlClientProvider>
  )
}

/** The page a broken, expired or foreign link lands on. */
export async function ShopInvalidLink() {
  const t = await getTranslations("webshop")
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div className="fade-in zoom-in-95 max-w-md animate-in space-y-3 duration-500">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <LinkIcon className="size-6" />
        </span>
        <h1 className="font-semibold text-2xl">{t("invalidLinkTitle")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("invalidLinkDescription")}
        </p>
      </div>
    </div>
  )
}
