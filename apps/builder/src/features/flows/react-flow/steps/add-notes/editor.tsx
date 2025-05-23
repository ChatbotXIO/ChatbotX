"use client"

import { TextareaField } from "@/components/form/textarea-field"

export const AddNotesStepEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  return <TextareaField name={`${parentName}.content`} label="Add Notes" />
}
