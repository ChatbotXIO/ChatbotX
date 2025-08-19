"use client"

import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/steps/open-ai/components/dialog"

type OpenAISpeechToTextEditorProps = {
  parentName: string
}

export const OpenAISpeechToTextEditor = (
  props: OpenAISpeechToTextEditorProps,
) => {
  return (
    <OpenAIDialog name="Flows.OpenAI.Title.SpeechToText">
      <CustomFieldSelect
        label="Audio"
        name={`${props.parentName}.audioCustomFieldId`}
      />

      <CustomFieldSelect
        allowCreate={true}
        label="Save response to a custom field"
        name={`${props.parentName}.resultCustomFieldId`}
      />
    </OpenAIDialog>
  )
}
