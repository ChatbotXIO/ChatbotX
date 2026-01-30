"use client"

import { FormFieldWrapper } from "@aha.chat/ui/components/form/field-wrapper"
import { TiptapEditor } from "./tiptap-editor"

export type TiptapEditorFieldProps = {
  label?: string
  name: string
  required?: boolean
  placeholder?: string
}

export const TiptapEditorField = ({
  name,
  label,
  required = false,
  placeholder,
}: TiptapEditorFieldProps) => (
  <FormFieldWrapper label={label} name={name} required={required}>
    {(field) => (
      <TiptapEditor
        defaultValue={field.value}
        onChange={field.onChange}
        placeholder={placeholder}
      />
    )}
  </FormFieldWrapper>
)
