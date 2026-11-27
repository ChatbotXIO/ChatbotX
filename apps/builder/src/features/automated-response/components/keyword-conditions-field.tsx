"use client"

import {
  isValuelessKeywordConditionOperator,
  type KeywordCondition,
  type KeywordConditionOperator,
  keywordConditionOperators,
  MAX_KEYWORD_CONDITION_VALUES,
  MAX_KEYWORD_CONDITIONS,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { FormField } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { Fragment, type KeyboardEvent, useMemo, useState } from "react"
import { type FieldError, useFieldArray, useFormContext } from "react-hook-form"

type KeywordConditionsFormValues = {
  conditions?: KeywordCondition[]
}

// Error codes raised by `keywordConditionSchema`; anything else is shown as-is.
const translatedErrorCodes = new Set([
  "keywordConditionValuesRequired",
  "keywordConditionTakesNoValues",
  "invalidKeywordRegex",
])

const collectErrorMessages = (error: unknown): string[] => {
  if (!error || typeof error !== "object") {
    return []
  }
  const { message } = error as FieldError
  if (typeof message === "string" && message.length > 0) {
    return [message]
  }
  return Object.values(error).flatMap(collectErrorMessages)
}

export const createEmptyKeywordCondition = (): KeywordCondition => ({
  operator: "contains",
  values: [],
})

/**
 * ManyChat-style message conditions for Contact keywords: each condition is a
 * match type plus keyword pills (any may match); conditions are joined by
 * "and" (all must match).
 */
export function KeywordConditionsField() {
  const t = useTranslations()
  const { control } = useFormContext<KeywordConditionsFormValues>()
  const { fields, append, remove } = useFieldArray({
    control,
    name: "conditions",
  })

  return (
    <div className="flex flex-col gap-3">
      <Label className="font-bold">{t("fields.keywords.label")}</Label>
      {fields.map((field, index) => (
        <Fragment key={field.id}>
          {index > 0 ? (
            <div className="flex items-center gap-2">
              <span className="rounded-md border px-3 py-1 text-sm">
                {t("keywords.conditions.and")}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          ) : null}
          <KeywordConditionRow
            index={index}
            onRemove={fields.length > 1 ? () => remove(index) : undefined}
          />
        </Fragment>
      ))}
      <p className="text-muted-foreground text-sm">
        {t("keywords.conditions.note")}
      </p>
      {fields.length < MAX_KEYWORD_CONDITIONS ? (
        <Button
          className="border-dashed"
          onClick={() => append(createEmptyKeywordCondition())}
          type="button"
          variant="outline"
        >
          <PlusIcon /> {t("keywords.conditions.addCondition")}
        </Button>
      ) : null}
    </div>
  )
}

function KeywordConditionRow(props: { index: number; onRemove?: () => void }) {
  const { index, onRemove } = props
  const t = useTranslations()
  const { control, setValue, watch } =
    useFormContext<KeywordConditionsFormValues>()
  const operator = watch(`conditions.${index}.operator`)

  const operatorItems = useMemo(
    () =>
      keywordConditionOperators.options.map((value) => ({
        value,
        label: t(`keywords.conditions.operators.${value}`),
      })),
    [t],
  )

  const handleOperatorChange = (
    nextOperator: KeywordConditionOperator,
    onChange: (value: KeywordConditionOperator) => void,
  ) => {
    onChange(nextOperator)
    // Value-less conditions (phone, image, 👍…) must carry no keywords, and a
    // regex list should not inherit plain keywords (or vice versa).
    if (
      isValuelessKeywordConditionOperator(nextOperator) ||
      (nextOperator === "matchesRegex") !== (operator === "matchesRegex")
    ) {
      setValue(`conditions.${index}.values`, [], {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <FormField
          control={control}
          name={`conditions.${index}.operator`}
          render={({ field }) => (
            <Select
              items={operatorItems}
              onValueChange={(value) =>
                handleOperatorChange(
                  value as KeywordConditionOperator,
                  field.onChange,
                )
              }
              value={field.value}
            >
              <SelectTrigger className="min-w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {operatorItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {onRemove ? (
          <Button
            aria-label={t("keywords.conditions.removeCondition")}
            className="ms-auto"
            onClick={onRemove}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2Icon />
          </Button>
        ) : null}
      </div>
      {operator && !isValuelessKeywordConditionOperator(operator) ? (
        <FormField
          control={control}
          name={`conditions.${index}.values`}
          render={({ field, fieldState }) => (
            <KeywordValuesInput
              errors={collectErrorMessages(fieldState.error).map((message) =>
                translatedErrorCodes.has(message)
                  ? t(`keywords.conditions.errors.${message}`)
                  : message,
              )}
              isRegex={operator === "matchesRegex"}
              onChange={field.onChange}
              value={field.value ?? []}
            />
          )}
        />
      ) : null}
    </div>
  )
}

function KeywordValuesInput(props: {
  value: string[]
  onChange: (values: string[]) => void
  isRegex: boolean
  errors: string[]
}) {
  const { value, onChange, isRegex, errors } = props
  const t = useTranslations()
  const [draft, setDraft] = useState("")
  const isFull = value.length >= MAX_KEYWORD_CONDITION_VALUES

  const commitDraft = () => {
    const keyword = draft.trim()
    setDraft("")
    if (!keyword || isFull || value.includes(keyword)) {
      return
    }
    onChange([...value, keyword])
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return
    }
    // A comma is part of many regexes, so only Enter commits a pattern.
    if (event.key === "Enter" || (!isRegex && event.key === ",")) {
      event.preventDefault()
      commitDraft()
      return
    }
    if (event.key === "Backspace" && draft.length === 0 && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {value.map((keyword, keywordIndex) => (
          <span
            className={cn(
              "flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-sm",
              isRegex && "font-mono",
            )}
            key={keyword}
          >
            {keyword}
            <button
              aria-label={t("actions.remove")}
              className="rounded-full p-0.5 hover:bg-destructive/20"
              onClick={() =>
                onChange(value.filter((_, index) => index !== keywordIndex))
              }
              type="button"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        {isFull ? null : (
          <input
            className={cn(
              "min-w-40 rounded-full border border-dashed bg-transparent px-3 py-1 text-sm outline-none focus:border-primary",
              isRegex && "font-mono",
            )}
            onBlur={commitDraft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t(
              isRegex
                ? "keywords.conditions.regexPlaceholder"
                : "keywords.conditions.keywordPlaceholder",
            )}
            value={draft}
          />
        )}
      </div>
      {errors.map((message) => (
        <p className="text-destructive text-sm" key={message}>
          {message}
        </p>
      ))}
    </div>
  )
}
