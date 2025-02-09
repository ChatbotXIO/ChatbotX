"use client"

import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog"

interface OpenAISpeechToTextEditorProps {
  parentName: string
}

export const OpenAISpeechToTextEditor = ({
  parentName,
}: OpenAISpeechToTextEditorProps) => {
  return (
    <OpenAIDialog name="Flows.OpenAI.Title.SpeechToText">
      <CustomFieldSelect
        name={`${parentName}.audioCustomFieldId`}
        label="Audio"
      />

      <CustomFieldSelect
        name={`${parentName}.resultCustomFieldId`}
        label="Save response to a custom field"
        allowCreate={true}
      />
    </OpenAIDialog>
  )
}
