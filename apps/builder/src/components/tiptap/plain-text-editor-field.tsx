"use client"

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useEffect, useState } from "react"
import { useFormContext } from "react-hook-form"
import { PlainTextTiptapEditor } from "./plain-text-tiptap-editor"

export type PlainTextEditorFieldProps = {
  label?: string
  name: string
  required?: boolean
  placeholder?: string
  formItemClassName?: string
  showEmojiPicker?: boolean
  description?: string
}

export const PlainTextEditorField = ({
  name,
  description,
  label,
  required = false,
  formItemClassName,
  placeholder,
  showEmojiPicker = true,
}: PlainTextEditorFieldProps) => {
  const { control, getValues } = useFormContext()

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
                  (optional)
                </span>
              )}
            </FormLabel>
          ) : null}
          <FormControl>
            <PlainTextTiptapEditor
              initValue={initValue}
              onChange={field.onChange}
              placeholder={placeholder}
              showEmojiPicker={showEmojiPicker}
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
