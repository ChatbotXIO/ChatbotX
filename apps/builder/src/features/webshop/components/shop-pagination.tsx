"use client"

import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useShop } from "./shop-provider"

export function ShopPagination({
  page,
  pageCount,
  params,
}: {
  page: number
  pageCount: number
  params: Record<string, string | null>
}) {
  const t = useTranslations("webshop")
  const shop = useShop()
  if (pageCount <= 1) {
    return null
  }
  const hrefFor = (target: number) => shop.href("", { ...params, page: target })
  const linkClass = cn(
    buttonVariants({
      size: "sm",
      variant: "outline",
      className: "rounded-full bg-background shadow-xs active:scale-95",
    }),
  )
  const disabledClass = cn(linkClass, "pointer-events-none opacity-50")
  return (
    <nav className="flex items-center justify-between gap-2 pt-6">
      {page > 1 ? (
        <Link className={linkClass} href={hrefFor(page - 1)}>
          <ChevronLeftIcon />
          {t("previous")}
        </Link>
      ) : (
        <span aria-disabled className={disabledClass}>
          <ChevronLeftIcon />
          {t("previous")}
        </span>
      )}
      <span className="text-muted-foreground text-sm tabular-nums">
        {t("pageOf", { page, pageCount })}
      </span>
      {page < pageCount ? (
        <Link className={linkClass} href={hrefFor(page + 1)}>
          {t("next")}
          <ChevronRightIcon />
        </Link>
      ) : (
        <span aria-disabled className={disabledClass}>
          {t("next")}
          <ChevronRightIcon />
        </span>
      )}
    </nav>
  )
}
