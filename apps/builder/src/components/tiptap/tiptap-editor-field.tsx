"use client"

import { FormFieldWrapper } from "@aha.chat/ui/components/form/field-wrapper"
import { TiptapEditor } from "./tiptap-editor"

export type TiptapEditorFieldProps = {
  name: string
}

export const TiptapEditorField = ({ name }: TiptapEditorFieldProps) => (
  <FormFieldWrapper name={name}>
    {(field) => (
      <TiptapEditor defaultValue={field.value} onChange={field.onChange} />
    )}
  </FormFieldWrapper>
)
