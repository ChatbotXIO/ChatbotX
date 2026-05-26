"use client"

import { PanelLeftOpenIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useInboxSidebarCollapsed } from "@/features/chat/hooks/use-inbox-sidebar-collapsed"

// Botão flutuante "expandir sidebar" que aparece quando o InboxAreaSidebar
// está collapsed. Lê do mesmo hook (sincroniza via localStorage event).
// Lucide PanelLeftOpen — fallback enquanto investigo glyph iconsax.
export function InboxSidebarExpandButton() {
  const t = useTranslations()
  const [collapsed, toggleCollapsed] = useInboxSidebarCollapsed()

  if (!collapsed) {
    return null
  }

  return (
    <div className="flex h-full w-9 shrink-0 flex-col items-center border-border border-r bg-app-surface pt-2">
      <button
        aria-label={t("inboxFilters.expandSidebar")}
        className="grid size-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-app-surface-2 hover:text-text-secondary"
        onClick={() => toggleCollapsed(false)}
        type="button"
      >
        <PanelLeftOpenIcon className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  )
}
