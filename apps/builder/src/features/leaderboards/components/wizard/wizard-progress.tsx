"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { CheckIcon } from "lucide-react"
import { useTranslations } from "next-intl"

const STEP_LABEL_KEYS = [
  "leaderboards.wizard.steps.info",
  "leaderboards.wizard.steps.config",
  "leaderboards.wizard.steps.review",
] as const

export function WizardProgress({ step }: { step: 1 | 2 | 3 }) {
  const t = useTranslations()
  return (
    <ol className="flex items-center gap-2">
      {STEP_LABEL_KEYS.map((labelKey, index) => {
        const number = index + 1
        const done = number < step
        const current = number === step
        const isLast = number === STEP_LABEL_KEYS.length
        // Only steps followed by a connector grow, so the last label sits at
        // the right edge and the connectors span the full width.
        return (
          <li
            className={cn(
              "flex items-center gap-2",
              isLast ? "shrink-0" : "flex-1",
            )}
            key={labelKey}
          >
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border font-semibold text-xs",
                done && "border-primary bg-primary text-primary-foreground",
                current && "border-primary text-primary",
                !(done || current) && "text-muted-foreground",
              )}
            >
              {done ? <CheckIcon className="size-4" /> : number}
            </span>
            <span
              className={cn(
                "truncate text-sm",
                current ? "font-semibold" : "text-muted-foreground",
              )}
            >
              {t(labelKey)}
            </span>
            {isLast ? null : (
              <span
                className={cn("h-px flex-1", done ? "bg-primary" : "bg-border")}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
