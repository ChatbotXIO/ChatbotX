import type { ThreadControlState } from "@chatbotx.io/database/partials"
import { BotIcon, CircleDashedIcon, HeadsetIcon } from "lucide-react"

/**
 * Semantic tone per resolved routing state (colour + icon + text, never colour
 * alone): this app owning the thread is the primary tone, another responder
 * the amber warning tone, idle muted. Shared by the list pill, the side panel
 * and the locked composer so the same state always looks the same.
 */
export const THREAD_CONTROL_TONES: Record<
  ThreadControlState,
  { className: string; dotClassName: string; icon: typeof BotIcon }
> = {
  owned: {
    className: "border-primary/30 bg-primary/10 text-primary",
    dotClassName: "bg-primary",
    icon: HeadsetIcon,
  },
  standby: {
    className:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
    dotClassName: "bg-amber-500",
    icon: BotIcon,
  },
  idle: {
    className: "border-border bg-muted text-muted-foreground",
    dotClassName: "bg-muted-foreground",
    icon: CircleDashedIcon,
  },
}
