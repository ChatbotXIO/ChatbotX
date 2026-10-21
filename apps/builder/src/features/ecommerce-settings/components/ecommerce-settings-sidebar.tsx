"use client"

import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import Link from "next/link"
import { useTranslations } from "next-intl"
import {
  type EcommerceSettingsSection,
  ecommerceSettingsSections,
} from "../lib/sections"

/**
 * The settings groups as a side list, drawn like the category list on the
 * Products page.
 */
export function EcommerceSettingsSidebar({
  workspaceId,
  active,
}: {
  workspaceId: string
  active: EcommerceSettingsSection
}) {
  const t = useTranslations()
  return (
    <aside className="w-64 shrink-0 border-e bg-card p-3">
      <div className="mb-2 px-2">
        <h2 className="font-semibold text-sm">{t("settings.title")}</h2>
      </div>
      <nav className="flex flex-col gap-1">
        {ecommerceSettingsSections.options.map((section) => (
          <Link
            aria-current={section === active ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "w-full justify-start",
              section === active && "bg-accent",
            )}
            href={`/space/${workspaceId}/ecommerce-settings/${section}`}
            key={section}
          >
            {t(`ecommerceSettings.tabs.${section}`)}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
