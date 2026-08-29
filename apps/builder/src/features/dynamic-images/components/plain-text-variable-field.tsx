"use client"

import { useEffect } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { PlainTextEditorField } from "@/components/tiptap/plain-text-editor-field"

type PlainTextVariableFieldValues = {
  text: string
}

type DynamicImageVariableTextFieldProps = {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
}

/**
 * Bridges the design-time element state (plain `useState`, not a form) with
 * `PlainTextEditorField`, which requires a react-hook-form context to work.
 * Callers must render this with `key={element.id}` so switching the selected
 * element remounts the bridge instead of trying to resync an editor that
 * only reads its initial value once.
 */
export function DynamicImageVariableTextField(
  props: DynamicImageVariableTextFieldProps,
) {
  const { value, onChange, label, placeholder } = props

  const form = useForm<PlainTextVariableFieldValues>({
    defaultValues: { text: value },
  })

  useEffect(() => {
    const subscription = form.watch((formValues) => {
      onChange(typeof formValues.text === "string" ? formValues.text : "")
    })

    return () => subscription.unsubscribe()
  }, [form, onChange])

  return (
    <FormProvider {...form}>
      <PlainTextEditorField
        includeBotFieldVariables
        includeRawCustomFieldVariables
        label={label}
        name="text"
        placeholder={placeholder}
      />
    </FormProvider>
  )
}
