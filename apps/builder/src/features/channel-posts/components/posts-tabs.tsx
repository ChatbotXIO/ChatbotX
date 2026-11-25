"use client"

import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

/**
 * The Posts area's sections. "New post" shows only where posts are the subject
 * (the list and the calendar); Analytics, Feeds and Connect carry their own single
 * primary action, so a screen never shows two competing primary buttons.
 */
export const PostsTabs = ({ workspaceId }: { workspaceId: string }) => {
  const t = useTranslations()
  const pathname = usePathname()
  const base = `/space/${workspaceId}/posts`
  const tabs = [
    { href: base, label: t("posts.tabs.posts"), active: pathname === base },
    {
      href: `${base}/calendar`,
      label: t("posts.tabs.calendar"),
      active: pathname.startsWith(`${base}/calendar`),
    },
    {
      href: `${base}/analytics`,
      label: t("posts.tabs.analytics"),
      active: pathname.startsWith(`${base}/analytics`),
    },
    {
      href: `${base}/feeds`,
      label: t("posts.tabs.feeds"),
      active: pathname.startsWith(`${base}/feeds`),
    },
    {
      href: `${base}/connect`,
      label: t("posts.tabs.connect"),
      active: pathname.startsWith(`${base}/connect`),
    },
  ]
  const showsNewPost = tabs[0].active || tabs[1].active

  return (
    <nav
      aria-label={t("posts.title")}
      className="mb-4 flex items-center gap-1 rounded-xl border bg-card p-1"
    >
      {tabs.map((tab) => (
        <Link
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "rounded-lg px-4 py-2 font-medium text-sm transition-colors hover:bg-muted",
            tab.active && "bg-primary/10 text-primary",
          )}
          href={tab.href}
          key={tab.href}
        >
          {tab.label}
        </Link>
      ))}
      {showsNewPost ? (
        <Link
          className={cn(buttonVariants({ size: "sm" }), "ms-auto")}
          href={`${base}/create`}
        >
          <PlusIcon />
          {t("composer.newPost")}
        </Link>
      ) : null}
    </nav>
  )
}
