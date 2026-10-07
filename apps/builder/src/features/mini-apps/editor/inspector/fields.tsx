"use client"

import type { MiniAppValidationIssue } from "@chatbotx.io/mini-app"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import { createContext, type ReactNode, useContext, useId } from "react"
import {
  type EnumPropertyKey,
  enumOptionLabelKey,
  type MiniAppPropertyKey,
  propertyLabelKey,
} from "../../lib/labels"
import { useIssueMessage } from "../../lib/use-issue-message"

/** Props + issues of the node being edited, shared by every field. */
export type InspectorContextValue = {
  props: Record<string, unknown>
  issues: MiniAppValidationIssue[]
  setProp: (key: string, value: unknown) => void
}

export const InspectorContext = createContext<InspectorContextValue>({
  props: {},
  issues: [],
  setProp: () => undefined,
})

export const useInspector = () => useContext(InspectorContext)

function PropertyIssues({ propKey }: { propKey: string }) {
  const { issues } = useInspector()
  const message = useIssueMessage()
  const matching = issues.filter(
    (issue) =>
      issue.property === propKey || issue.property?.startsWith(`${propKey}.`),
  )
  if (matching.length === 0) {
    return null
  }
  return (
    <div className="flex flex-col">
      {matching.map((issue, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: issues have no id
        <span className="text-destructive text-xs" key={index}>
          {message(issue)}
        </span>
      ))}
    </div>
  )
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
      {hint ? (
        <span className="text-muted-foreground text-xs">{hint}</span>
      ) : null}
      <PropertyIssues propKey={propKey} />
    </div>
  )
}

const readString = (value: unknown) => (typeof value === "string" ? value : "")

export function TextProp({
  propKey,
  maxLength,
  multiline = false,
  placeholder,
  hint,
  mono = false,
}: {
  propKey: MiniAppPropertyKey
  maxLength?: number
  multiline?: boolean
  placeholder?: string
  hint?: ReactNode
  mono?: boolean
}) {
  const id = useId()
  const { props, setProp } = useInspector()
  const value = readString(props[propKey])
  const counter = maxLength ? (
    <span
      className={cn(
        "text-xs",
        value.length > maxLength ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {value.length}/{maxLength}
    </span>
  ) : null
  const onChange = (next: string) =>
    setProp(propKey, next === "" ? undefined : next)
  return (
    <FieldRow hint={hint} htmlFor={id} propKey={propKey}>
      <div className="flex flex-col gap-1">
        {multiline ? (
          <Textarea
            className={cn("min-h-20", mono && "font-mono text-xs")}
            id={id}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            value={value}
          />
        ) : (
          <Input
            className={cn(mono && "font-mono text-xs")}
            id={id}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            value={value}
          />
        )}
        {counter ? <div className="flex justify-end">{counter}</div> : null}
      </div>
    </FieldRow>
  )
}

export function NumberProp({
  propKey,
  min,
  max,
  step = 1,
}: {
  propKey: MiniAppPropertyKey
  min?: number
  max?: number
  step?: number
}) {
  const id = useId()
  const { props, setProp } = useInspector()
  const value = props[propKey]
  return (
    <FieldRow htmlFor={id} propKey={propKey}>
      <Input
        id={id}
        max={max}
        min={min}
        onChange={(event) => {
          const raw = event.target.value
          setProp(propKey, raw === "" ? undefined : Number(raw))
        }}
        step={step}
        type="number"
        value={typeof value === "number" ? value : ""}
      />
    </FieldRow>
  )
}

export function BooleanProp({ propKey }: { propKey: MiniAppPropertyKey }) {
  const id = useId()
  const { props, setProp } = useInspector()
  return (
    <FieldRow htmlFor={id} inline propKey={propKey}>
      <Switch
        checked={props[propKey] === true}
        id={id}
        onCheckedChange={(checked) => setProp(propKey, checked)}
      />
    </FieldRow>
  )
}

export function EnumProp<K extends EnumPropertyKey>({
  propKey,
  allowEmpty = true,
}: {
  propKey: K
  allowEmpty?: boolean
}) {
  const t = useTranslations()
  const { props, setProp } = useInspector()
  const labels = enumOptionLabelKey[propKey] as Record<string, string>
  const items = [
    ...(allowEmpty
      ? [{ value: "", label: t("miniApps.inspector.default") }]
      : []),
    ...Object.entries(labels).map(([value, key]) => ({ value, label: t(key) })),
  ]
  return (
    <FieldRow propKey={propKey}>
      <Select
        items={items}
        onValueChange={(value) => setProp(propKey, value ? value : undefined)}
        value={readString(props[propKey])}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value || "default"} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  )
}

export function DateProp({ propKey }: { propKey: MiniAppPropertyKey }) {
  const id = useId()
  const { props, setProp } = useInspector()
  return (
    <FieldRow htmlFor={id} propKey={propKey}>
      <Input
        id={id}
        onChange={(event) => setProp(propKey, event.target.value || undefined)}
        type="date"
        value={readString(props[propKey])}
      />
    </FieldRow>
  )
}

/** Comma-separated list editor for string arrays (dates, MIME types). */
export function ListProp({
  propKey,
  placeholder,
}: {
  propKey: MiniAppPropertyKey
  placeholder?: string
}) {
  const id = useId()
  const t = useTranslations("miniApps.inspector")
  const { props, setProp } = useInspector()
  const value = Array.isArray(props[propKey])
    ? (props[propKey] as string[]).join(", ")
    : ""
  return (
    <FieldRow hint={t("commaSeparated")} htmlFor={id} propKey={propKey}>
      <Input
        defaultValue={value}
        id={id}
        key={value}
        onBlur={(event) => {
          const items = event.target.value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
          setProp(propKey, items.length > 0 ? items : undefined)
        }}
        placeholder={placeholder}
      />
    </FieldRow>
  )
}

/** Checkbox list for a fixed set of enum values stored as an array. */
export function MultiEnumProp({ propKey }: { propKey: "include-days" }) {
  const t = useTranslations()
  const { props, setProp } = useInspector()
  const selected = Array.isArray(props[propKey])
    ? (props[propKey] as string[])
    : []
  const labels = enumOptionLabelKey[propKey] as Record<string, string>
  return (
    <FieldRow propKey={propKey}>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(labels).map(([value, key]) => {
          const isSelected = selected.includes(value)
          return (
            <button
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs",
                isSelected
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground",
              )}
              key={value}
              onClick={() => {
                const next = isSelected
                  ? selected.filter((day) => day !== value)
                  : [...selected, value]
                setProp(propKey, next.length > 0 ? next : undefined)
              }}
              type="button"
            >
              {t(key)}
            </button>
          )
        })}
      </div>
    </FieldRow>
  )
}
