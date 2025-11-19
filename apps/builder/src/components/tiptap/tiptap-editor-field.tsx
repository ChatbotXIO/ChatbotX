"use client"

import { FormFieldWrapper } from "@aha.chat/ui/components/form/field-wrapper"
import { TiptapEditor } from "./tiptap-editor"

export type TiptapEditorFieldProps = {
  name: string
  customFields: { label: string; value: string; type: string }[]
}

export const TiptapEditorField = ({
  name,
  customFields,
}: TiptapEditorFieldProps) => (
  <FormFieldWrapper name={name}>
    {(field) => (
      <TiptapEditor
        customFields={customFields}
        defaultValue={field.value}
        onChange={field.onChange}
      />
    )}
  </FormFieldWrapper>
)
