"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"

/** AhaChat's mark (its own favicon), drawn inline so no asset is fetched. */
function AhachatMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 200 2000 1598"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g fill="#ff5000">
        <path d="M995.16,763.43L0,1788.32,999.63,200,2000,1798Z" />
        <path d="M1139.56,1172m-599.93,280.6H1435.8L1254.19,1271,716,1273.27V1274l-176.4,176.4" />
      </g>
    </svg>
  )
}

/**
 * Shown next to a page AhaChat has: dimmed until the row uses AhaChat's data
 * (`selected`), then in full color.
 */
export function AhachatPageBadge({ selected }: { selected: boolean }) {
  const t = useTranslations()
  const label = selected
    ? t("ahachatImport.badge.selected")
    : t("ahachatImport.badge.onAhachat")
  return (
    <span
      aria-label={label}
      className="inline-flex size-4 shrink-0 items-center justify-center"
      role="img"
      title={label}
    >
      <AhachatMark
        className={cn("size-3.5 transition-opacity", !selected && "opacity-50")}
      />
    </span>
  )
}
