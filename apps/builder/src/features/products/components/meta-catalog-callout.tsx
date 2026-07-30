import { cn } from "@chatbotx.io/ui/lib/utils"
import type { ReactNode } from "react"

type CalloutTone = "info" | "success" | "warning" | "danger"

const TONE_STYLES: Record<CalloutTone, string> = {
  info: "border-blue-500/40 bg-blue-500/10",
  success: "border-emerald-500/40 bg-emerald-500/10",
  warning: "border-amber-500/40 bg-amber-500/10",
  danger: "border-destructive/40 bg-destructive/10",
}

export function MetaCatalogCallout({
  tone,
  action,
  children,
}: {
  tone: CalloutTone
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm",
        TONE_STYLES[tone],
      )}
    >
      <div className="flex min-w-0 items-center gap-2">{children}</div>
      {action}
    </div>
  )
}
