"use client"

import {
  COMMENT_MENTION_COUNT_MAX,
  type CommentIncludeKeywordsType,
} from "@chatbotx.io/database/partials"
import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { TagsInputField } from "@chatbotx.io/ui/components/ui/muhammada86/tags-input-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"

type Props = {
  /** Channel-namespaced labels the form already had before this field. */
  labels: {
    type: string
    typeDescription?: string
    keywords: string
    keywordsPlaceholder: string
    all: string
    equal: string
    contain: string
  }
}

const MENTION_COUNTS = Array.from(
  { length: COMMENT_MENTION_COUNT_MAX },
  (_, index) => index + 1,
)

/**
 * The "Reply to" filter: every comment, a keyword match, or — independent of
 * any keyword — a comment that tags EXACTLY the chosen number of accounts.
 * Writes `includeKeywords.type`, `.value` and `.mentionCount`.
 */
export function ReplyToField({ labels }: Props) {
  const t = useTranslations()
  const { control, getValues, setValue } = useFormContext()
  const type = useWatch({
    control,
    name: "includeKeywords.type",
  }) as CommentIncludeKeywordsType

  // A fresh `mentions` pick has no count yet; 1 is the smallest valid one and
  // keeps the select from rendering empty.
  useEffect(() => {
    if (type === "mentions" && !getValues("includeKeywords.mentionCount")) {
      setValue("includeKeywords.mentionCount", 1, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }, [type, getValues, setValue])

  const typeOptions = [
    { label: labels.all, value: "all" },
    { label: labels.equal, value: "equal" },
    { label: labels.contain, value: "contain" },
    { label: t("commentAutomation.replyTo.mentions"), value: "mentions" },
  ]

  const countItems = useMemo(
    () =>
      MENTION_COUNTS.map((count) => ({
        label: t("commentAutomation.replyTo.mentionCountOption", { count }),
        value: String(count),
      })),
    [t],
  )

  return (
    <div className="flex items-start gap-2">
      <SelectField
        description={labels.typeDescription}
        descriptionType="tooltip"
        label={labels.type}
        name="includeKeywords.type"
        options={typeOptions}
        required
      />
      {(type === "equal" || type === "contain") && (
        <div className="w-full">
          <FormField
            control={control}
            name="includeKeywords.value"
            render={() => (
              <FormItem>
                <FormLabel>{labels.keywords}</FormLabel>
                <FormControl>
                  <TagsInputField
                    name="includeKeywords.value"
                    placeholder={labels.keywordsPlaceholder}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}
      {type === "mentions" && (
        <div className="w-full">
          <FormFieldWrapper
            description={t("commentAutomation.replyTo.mentionCountDescription")}
            descriptionType="tooltip"
            label={t("commentAutomation.replyTo.mentionCount")}
            name="includeKeywords.mentionCount"
            required
          >
            {(field) => (
              // Stored as a number, while a select item's value is a string —
              // converted both ways so an edited automation shows its count.
              <Select
                items={countItems}
                onValueChange={(value) => field.onChange(Number(value))}
                value={field.value ? String(field.value) : ""}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {countItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormFieldWrapper>
        </div>
      )}
    </div>
  )
}
