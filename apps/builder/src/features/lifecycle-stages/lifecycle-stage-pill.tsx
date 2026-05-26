import type { LifecycleStageModel } from "@chatbotx.io/database/types"
import { cn } from "@chatbotx.io/ui/lib/utils"

// Pill read-only do lifecycle. Pra usar na linha 3 do ConversationItem
// (pixel-perfect Respond.io § 5 do _visual-respond-mapping.md):
//   inline-flex h 20 max-w 132 padding 2 4 radius 4
//   bg rgba(206,206,208,.16) color text-secondary 12/600 line-h 16
// Sem dropdown, sem click handler. Pra edição usar LifecycleBadgeSelect.
type LifecycleStagePillProps = {
  stage: Pick<LifecycleStageModel, "icon" | "name"> | null | undefined
  className?: string
}

export function LifecycleStagePill({
  stage,
  className,
}: LifecycleStagePillProps) {
  if (!stage) {
    return null
  }
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-[132px] items-center gap-1 truncate rounded-[4px] bg-[rgba(206,206,208,0.16)] px-1 py-0.5 font-semibold text-[12px] text-text-secondary leading-4",
        className,
      )}
      title={stage.name}
    >
      {stage.icon && (
        <span aria-hidden="true" className="shrink-0">
          {stage.icon}
        </span>
      )}
      <span className="truncate">{stage.name}</span>
    </span>
  )
}
