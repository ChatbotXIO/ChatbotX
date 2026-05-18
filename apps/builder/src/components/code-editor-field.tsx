"use client"

import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { css } from "@codemirror/lang-css"
import { javascript } from "@codemirror/lang-javascript"
import CodeMirror from "@uiw/react-codemirror"
import { useTheme } from "next-themes"
import type { FieldPath, FieldValues } from "react-hook-form"

type CodeEditorFieldProps<T extends FieldValues> = {
  name: FieldPath<T>
  label?: string
  description?: string
  language: "javascript" | "css"
  placeholder?: string
  required?: boolean
}

const LANGUAGE_EXTENSIONS = {
  javascript: [javascript()],
  css: [css()],
}

export function CodeEditorField<T extends FieldValues>({
  name,
  label,
  description,
  language,
  required,
}: CodeEditorFieldProps<T>) {
  const { resolvedTheme } = useTheme()

  return (
    <FormFieldWrapper
      description={description}
      label={label}
      name={name}
      required={required}
    >
      {(field) => (
        <CodeMirror
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLine: false,
          }}
          className="overflow-hidden rounded-md border text-sm"
          extensions={LANGUAGE_EXTENSIONS[language]}
          height="200px"
          onChange={field.onChange}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          value={field.value ?? ""}
        />
      )}
    </FormFieldWrapper>
  )
}
