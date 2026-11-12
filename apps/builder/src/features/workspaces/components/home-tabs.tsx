import { cn } from "@chatbotx.io/ui/lib/utils"
import Link from "next/link"
import { type HomeTab, homeTabs } from "../schema/home-search-params"

type HomeTabDefinition = {
  href: string
  showsCount: boolean
}

const HOME_TAB_DEFINITIONS = {
  workspaces: { href: "/", showsCount: true },
  templates: { href: "/?tab=templates", showsCount: false },
} as const satisfies Record<HomeTab, HomeTabDefinition>

/** The id of a tab's link, which the tab's content region points back to. */
export const homeTabLinkId = (tab: HomeTab): string => `home-tab-${tab}`

type HomeTabsProps = {
  activeTab: HomeTab
  /** The accessible name of the group of tabs. */
  navLabel: string
  labels: Record<HomeTab, string>
  workspaceCount: number
}

/**
 * The sections of the home page as plain text links: the open one reads as the
 * heading, the others are muted. They are real links, so each section has its
 * own URL, survives a reload and works without client JavaScript.
 */
export function HomeTabs({
  activeTab,
  navLabel,
  labels,
  workspaceCount,
}: HomeTabsProps) {
  return (
    <nav aria-label={navLabel} className="flex items-baseline gap-5">
      {homeTabs.map((tab) => {
        const { href, showsCount } = HOME_TAB_DEFINITIONS[tab]
        const isActive = tab === activeTab
        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-sm font-semibold text-base outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            href={href}
            id={homeTabLinkId(tab)}
            key={tab}
            scroll={false}
          >
            {labels[tab]}
            {showsCount ? (
              <span className="ms-2 font-medium text-muted-foreground text-sm tabular-nums">
                {workspaceCount}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
