"use client"

import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { TagsInputField } from "@chatbotx.io/ui/components/ui/muhammada86/tags-input-field"
import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"

type Props = {
  label: string
  description?: string
  placeholder: string
}

/**
 * "Exclude comments containing": one field — how the excluded keywords match
 * (the whole comment, `equal`; or anywhere in it, `contain`, the default and
 * the only behavior before the match type existed), with the keywords
 * themselves entered right below.
 */
export function ExcludeKeywordsField({
  label,
  description,
  placeholder,
}: Props) {
  const t = useTranslations()
  const { control } = useFormContext()

  return (
    <div className="space-y-2">
      <RadioGroupField
        description={description}
        descriptionType="tooltip"
        label={label}
        name="excludeKeywordsType"
        options={[
          {
            label: t("commentAutomation.excludeKeywordsType.equal"),
            value: "equal",
          },
          {
            label: t("commentAutomation.excludeKeywordsType.contain"),
            value: "contain",
          },
        ]}
        orientation="horizontal"
      />
      <FormField
        control={control}
        name="excludeKeywords"
        render={() => (
          <FormItem>
            <FormControl>
              <TagsInputField
                name="excludeKeywords"
                placeholder={placeholder}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
