"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { type ReactNode, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useShop } from "./shop-provider"

/**
 * A bar pinned to the bottom of the screen, whatever the scroll: the page's
 * main action stays one tap away. The page keeps `pb-32` free under its
 * content for it. It is drawn on `<body>`: a sliding (transformed) parent
 * would otherwise pin it to itself, not the screen — so a submit button in it
 * names its form with `form`.
 */
export function ShopBottomBar({
  className,
  children,
}: {
  /** Matches the page's content width, e.g. `max-w-2xl`. */
  className?: string
  children: ReactNode
}) {
  const { brandColorStyle } = useShop()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) {
    return null
  }
  return createPortal(
    <div
      className="slide-in-from-bottom fixed inset-x-0 bottom-0 z-20 animate-in border-t bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.15)] backdrop-blur-md duration-300 motion-reduce:animate-none"
      style={brandColorStyle}
    >
      <div
        className={cn(
          "mx-auto flex max-w-5xl items-center gap-3 px-4 py-3",
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
