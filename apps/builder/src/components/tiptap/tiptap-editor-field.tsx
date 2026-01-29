"use client"

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@aha.chat/ui/components/ui/form"
import { cn } from "@aha.chat/ui/lib/utils"
import { useEffect, useState } from "react"
import { useFormContext } from "react-hook-form"
import { TiptapEditor } from "./tiptap-editor"

export type TiptapEditorFieldProps = {
  label?: string
  name: string
  required?: boolean
  placeholder?: string
  formItemClassName?: string
}

export const TiptapEditorField = ({
  name,
  label,
  required = false,
  formItemClassName,
  placeholder,
}: TiptapEditorFieldProps) => {
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
            <TiptapEditor
              initValue={initValue}
              onChange={field.onChange}
              placeholder={placeholder}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
