"use client"

import type { MiniAppValidationIssue } from "@chatbotx.io/mini-app"
import { displayTextLength } from "@chatbotx.io/mini-app"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import { createContext, type ReactNode, useContext } from "react"
import { type MiniAppPropertyKey, propertyLabelKey } from "../../lib/labels"
import { useIssueMessage } from "../../lib/use-issue-message"

/** Props + issues of the node being edited, shared by every field. */
export type InspectorContextValue = {
  props: Record<string, unknown>
  /** Visitor-facing properties of the node: they get the custom field picker. */
  displayKeys?: ReadonlySet<string>
  issues: MiniAppValidationIssue[]
  setProp: (key: string, value: unknown) => void
}

export const InspectorContext = createContext<InspectorContextValue>({
  props: {},
  issues: [],
  setProp: () => undefined,
})

export const useInspector = () => useContext(InspectorContext)

const ISSUE_BOX_CLASS = {
  error:
    "flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive text-xs",
  warning:
    "flex flex-col gap-1 rounded-md border border-amber-500/60 bg-amber-500/5 p-2 text-amber-700 text-xs dark:text-amber-400",
} as const

/** Errors in a red box, warnings in an amber box (amber text, amber border). */
export function IssueList({ issues }: { issues: MiniAppValidationIssue[] }) {
  const message = useIssueMessage()
  return (
    <>
      {(["error", "warning"] as const).map((severity) => {
        const matching = issues.filter((issue) => issue.severity === severity)
        if (matching.length === 0) {
          return null
        }
        return (
          <div className={ISSUE_BOX_CLASS[severity]} key={severity}>
            {matching.map((issue, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: issues have no id
              <span key={index}>{message(issue)}</span>
            ))}
          </div>
        )
      })}
    </>
  )
}

function PropertyIssues({ propKey }: { propKey: string }) {
  const { issues } = useInspector()
  const matching = issues.filter(
    (issue) =>
      issue.property === propKey || issue.property?.startsWith(`${propKey}.`),
  )
  return <IssueList issues={matching} />
}

/** Helper text under a field. */
export function InspectorHint({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground text-xs">{children}</span>
}

export function FieldRow({
  propKey,
  htmlFor,
  hint,
  children,
  inline = false,
}: {
  propKey: MiniAppPropertyKey
  htmlFor?: string
  hint?: ReactNode
  children: ReactNode
  inline?: boolean
}) {
  const t = useTranslations()
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "flex gap-2",
          inline ? "items-center justify-between" : "flex-col",
        )}
      >
        <Label htmlFor={htmlFor}>{t(propertyLabelKey[propKey])}</Label>
        {children}
      </div>
      {hint ? <InspectorHint>{hint}</InspectorHint> : null}
      <PropertyIssues propKey={propKey} />
    </div>
  )
}

/** `length/max` under a text field; a `{{custom field}}` counts as one character. */
export function DisplayTextCounter({
  value,
  maxLength,
}: {
  value: string
  maxLength: number
}) {
  const length = displayTextLength(value)
  return (
    <div className="flex justify-end">
      <span
        className={cn(
          "text-xs",
          length > maxLength ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {length}/{maxLength}
      </span>
    </div>
  )
}
