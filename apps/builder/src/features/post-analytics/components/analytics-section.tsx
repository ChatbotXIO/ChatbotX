"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { AlertCircleIcon, RefreshCwIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

/** A titled card; `action` sits at the end of the header (a selector, a toggle). */
export const AnalyticsSection = ({
  action,
  children,
  description,
  title,
}: {
  action?: ReactNode
  children: ReactNode
  description?: ReactNode
  title: string
}) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      {description ? <CardDescription>{description}</CardDescription> : null}
      {action ? <CardAction>{action}</CardAction> : null}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
)

/** A section that failed to load, with a retry. */
export const SectionError = ({
  onRetry,
  retrying,
}: {
  onRetry: () => void
  retrying: boolean
}) => {
  const t = useTranslations("posts.analytics.states")
  return (
    <div
      className="flex min-h-40 flex-col items-center justify-center gap-3 p-4 text-center"
      role="alert"
    >
      <AlertCircleIcon aria-hidden="true" className="size-6 text-destructive" />
      <p className="text-sm">{t("error")}</p>
      <Button
        disabled={retrying}
        onClick={onRetry}
        size="sm"
        type="button"
        variant="outline"
      >
        <RefreshCwIcon className={cn(retrying && "animate-spin")} />
        {t("retry")}
      </Button>
    </div>
  )
}

/** A section with nothing to show for the current filters. */
export const SectionEmpty = ({
  hint,
  title,
}: {
  hint?: string
  title: string
}) => (
  <div className="flex min-h-40 flex-col items-center justify-center gap-1 p-4 text-center">
    <p className="font-medium text-sm">{title}</p>
    {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
  </div>
)

type Choice<Value extends string> = { label: string; value: Value }

/** A small single-choice button row (a segmented control). */
export const ChoiceButtons = <Value extends string>({
  ariaLabel,
  choices,
  onChange,
  value,
}: {
  ariaLabel: string
  choices: readonly Choice<Value>[]
  onChange: (value: Value) => void
  value: Value
}) => (
  <fieldset
    aria-label={ariaLabel}
    className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-0.5"
  >
    {choices.map((choice) => (
      <button
        aria-pressed={choice.value === value}
        className={cn(
          "rounded-md px-2.5 py-1 text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          choice.value === value &&
            "bg-background font-medium shadow-sm hover:bg-background",
        )}
        key={choice.value}
        onClick={() => onChange(choice.value)}
        type="button"
      >
        {choice.label}
      </button>
    ))}
  </fieldset>
)
