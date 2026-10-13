"use client"

import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { NumberInput } from "@chatbotx.io/ui/components/ui/input-number"
import {
  RadioGroup,
  RadioGroupItem,
} from "@chatbotx.io/ui/components/ui/radio-group"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  RECURRENCE_MAX_OCCURRENCES,
  type RecurrenceRule,
  recurrenceEndKinds,
} from "@chatbotx.io/utils/recurrence"
import { useTranslations } from "next-intl"
import { useId } from "react"
import { useFormContext } from "react-hook-form"
import { LocalDatePicker } from "./local-date-picker"

type RecurrenceEnd = RecurrenceRule["end"]

const DEFAULT_OCCURRENCES = 10
const OPTION_LABEL_CLASS_NAME = "font-medium text-sm leading-none"

/**
 * Each option is a card, and the whole card picks it: the chosen one is
 * outlined and tinted so it reads at a glance. A disabled input inside an
 * unchosen card lets the click through to the card instead of swallowing it.
 */
const optionClassName = (selected: boolean) =>
  cn(
    "flex cursor-pointer flex-col gap-1.5 rounded-md border p-3 transition-colors [&_:disabled]:pointer-events-none",
    selected
      ? "border-primary bg-primary/5"
      : "border-input hover:bg-accent/40",
  )

/** The `end` object a kind starts as when it is picked. */
const endFor = (
  kind: RecurrenceEnd["kind"],
  startsOn: string,
): RecurrenceEnd => {
  if (kind === recurrenceEndKinds.enum.onDate) {
    return { kind, date: startsOn }
  }
  if (kind === recurrenceEndKinds.enum.afterOccurrences) {
    return { kind, count: DEFAULT_OCCURRENCES }
  }
  return { kind: recurrenceEndKinds.enum.never }
}

/**
 * "Ends: never / on a date / after N occurrences". Only the input of the
 * selected option is enabled, and its error (the rule's `end.date` / `end.count`
 * issue) is shown right under it.
 */
export function RecurrenceEndField({
  namePrefix,
  startsOn,
}: {
  namePrefix: string
  startsOn: string
}) {
  const t = useTranslations("recurrence")
  const groupId = useId()
  const { getFieldState, formState } = useFormContext()
  const dateError = getFieldState(`${namePrefix}.end.date`, formState).error
  const countError = getFieldState(`${namePrefix}.end.count`, formState).error

  return (
    <FormFieldWrapper
      label={t("end.label")}
      name={`${namePrefix}.end`}
      required
    >
      {(field) => {
        const end = field.value as RecurrenceEnd
        // Picking the kind already chosen must not reset what was typed.
        const choose = (kind: RecurrenceEnd["kind"]) => {
          if (end.kind !== kind) {
            field.onChange(endFor(kind, startsOn) as never)
          }
        }
        return (
          <RadioGroup
            className="flex flex-col gap-2"
            onValueChange={(kind) => choose(kind as RecurrenceEnd["kind"])}
            value={end.kind}
          >
            <label
              className={cn(
                optionClassName(end.kind === "never"),
                "flex-row items-center gap-2",
              )}
              htmlFor={`${groupId}-never`}
            >
              <RadioGroupItem id={`${groupId}-never`} value="never" />
              <span className={OPTION_LABEL_CLASS_NAME}>{t("end.never")}</span>
            </label>
            <label
              className={optionClassName(end.kind === "onDate")}
              htmlFor={`${groupId}-onDate`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <RadioGroupItem id={`${groupId}-onDate`} value="onDate" />
                <span className={OPTION_LABEL_CLASS_NAME}>
                  {t("end.onDate")}
                </span>
                <LocalDatePicker
                  ariaLabel={t("end.onDate")}
                  disabled={end.kind !== "onDate"}
                  onChange={(date) =>
                    field.onChange({ kind: "onDate", date } as never)
                  }
                  placeholder={t("end.pickDate")}
                  value={end.kind === "onDate" ? end.date : undefined}
                />
              </div>
              {dateError && (
                <p className="text-destructive text-sm" role="alert">
                  {dateError.message}
                </p>
              )}
            </label>
            <label
              className={optionClassName(end.kind === "afterOccurrences")}
              htmlFor={`${groupId}-after`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <RadioGroupItem
                  id={`${groupId}-after`}
                  value="afterOccurrences"
                />
                <span className={OPTION_LABEL_CLASS_NAME}>
                  {t("end.after")}
                </span>
                <div className="w-28 shrink-0">
                  <NumberInput
                    aria-label={t("end.after")}
                    className="w-full"
                    disabled={end.kind !== "afterOccurrences"}
                    max={RECURRENCE_MAX_OCCURRENCES}
                    min={1}
                    onValueChange={(count) =>
                      // An emptied input stays empty (the rule then reports the
                      // missing count) instead of snapping back while typing.
                      field.onChange({
                        kind: "afterOccurrences",
                        count,
                      } as never)
                    }
                    value={
                      end.kind === "afterOccurrences" ? end.count : undefined
                    }
                  />
                </div>
                <span className="text-muted-foreground text-sm">
                  {t("end.occurrences", {
                    count:
                      end.kind === "afterOccurrences"
                        ? (end.count ?? DEFAULT_OCCURRENCES)
                        : DEFAULT_OCCURRENCES,
                  })}
                </span>
              </div>
              {countError && (
                <p className="text-destructive text-sm" role="alert">
                  {countError.message}
                </p>
              )}
            </label>
          </RadioGroup>
        )
      }}
    </FormFieldWrapper>
  )
}
