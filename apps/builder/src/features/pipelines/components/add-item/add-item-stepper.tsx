"use client"

import { CheckIcon } from "lucide-react"

type Step = { id: string; label: string }

/** Two-or-more step indicator; finished steps show a check, the active one is filled. */
export function AddItemStepper({
  steps,
  activeIndex,
}: {
  steps: Step[]
  activeIndex: number
}) {
  return (
    <ol className="flex items-center gap-2 px-4 text-sm">
      {steps.map((step, index) => {
        const done = index < activeIndex
        const active = index === activeIndex
        return (
          <li
            aria-current={active ? "step" : undefined}
            className="flex min-w-0 flex-1 items-center gap-2"
            key={step.id}
          >
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full border font-medium text-xs ${
                done || active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {done ? <CheckIcon className="size-3.5" /> : index + 1}
            </span>
            <span
              className={`truncate ${active ? "font-medium" : "text-muted-foreground"}`}
            >
              {step.label}
            </span>
            {index < steps.length - 1 ? (
              <span className="h-px min-w-4 flex-1 bg-border" />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
