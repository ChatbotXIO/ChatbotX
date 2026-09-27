"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useFormContext } from "react-hook-form"
import { CharacterCounter } from "@/components/character-counter"
import { TiptapEditor } from "./tiptap-editor"

export type TiptapEditorFieldProps = {
  label?: string
  name: string
  required?: boolean
  placeholder?: string
  formItemClassName?: string
  showEmojiPicker?: boolean
  enableEmoji?: boolean
  channels?: ChannelType[]
  includeCouponVariables?: boolean
  includeRawCustomFieldVariables?: boolean
  includeBotFieldVariables?: boolean
  description?: string
  /** When set, renders a live `used/limit` character counter below the editor. */
  maxLength?: number
}

export const TiptapEditorField = ({
  name,
  description,
  label,
  required = false,
  formItemClassName,
  placeholder,
  channels,
  includeCouponVariables = false,
  includeRawCustomFieldVariables = false,
  includeBotFieldVariables = false,
  showEmojiPicker = true,
  enableEmoji = true,
  maxLength,
}: TiptapEditorFieldProps) => {
  const { control, getValues } = useFormContext()
  const t = useTranslations("fields")

  const [initValue, setInitValue] = useState<string | undefined>(undefined)

  useEffect(() => {
    const initValue = getValues(name)
    setInitValue(initValue)
  }, [getValues, name])

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn("w-full", formItemClassName)}>
          {label ? (
            <FormLabel className="flex gap-1">
              {label}
              {!required && (
                <span className="self-start font-normal text-xxs">
                  {t("optionalHint")}
                </span>
              )}
            </FormLabel>
          ) : null}
          <FormControl>
            <TiptapEditor
              channels={channels}
              enableEmoji={enableEmoji}
              includeBotFieldVariables={includeBotFieldVariables}
              includeCouponVariables={includeCouponVariables}
              includeRawCustomFieldVariables={includeRawCustomFieldVariables}
              initValue={initValue}
              onChange={field.onChange}
              placeholder={placeholder}
              showEmojiPicker={showEmojiPicker}
              toolbarEnd={
                maxLength ? (
                  <CharacterCounter
                    max={maxLength}
                    value={field.value}
                    variant="inverted"
                  />
                ) : null
              }
            />
          </FormControl>
          {description ? (
            <FormDescription>{description}</FormDescription>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
