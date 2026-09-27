"use client"

import { countMessageCharacters } from "@chatbotx.io/flow-config"
import { cn } from "@chatbotx.io/ui/lib/utils"

type CharacterCounterProps = {
  value: string | null | undefined
  /** Limit to count against — usually resolved from the node's channel. */
  max: number
  /**
   * `inverted` is for the editor's dark toolbar, where the default muted and
   * destructive tokens are both unreadable against the grey.
   */
  variant?: "default" | "inverted"
  className?: string
}

const TONES = {
  default: {
    overLimit: "font-medium text-destructive",
    withinLimit: "text-muted-foreground",
  },
  inverted: {
    overLimit: "font-medium text-red-200",
    withinLimit: "text-white/80",
  },
} as const

/**
 * Live `used/limit` readout for a text field.
 *
 * Renders digits only, so it needs no translation key. Over-limit is carried
 * by color plus `aria-invalid`, since the numbers themselves already say it.
 */
export const CharacterCounter = ({
  value,
  max,
  variant = "default",
  className,
}: CharacterCounterProps) => {
  const count = countMessageCharacters(value)
  const isOverLimit = count > max
  const tone = TONES[variant]

  return (
    <span
      aria-invalid={isOverLimit || undefined}
      aria-live="polite"
      className={cn(
        "text-xs tabular-nums",
        isOverLimit ? tone.overLimit : tone.withinLimit,
        className,
      )}
      data-slot="character-counter"
    >
      {count}/{max}
    </span>
  )
}
