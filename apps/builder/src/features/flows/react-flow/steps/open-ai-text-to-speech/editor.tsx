"use client"

import { InputField } from "@/components/form/input-field"
import { SelectField } from "@/components/form/select-field"
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/steps/open-ai/components/dialog"
import { voiceTypes } from "./schema"

interface OpenAITextToSpeechEditorProps {
  parentName: string
}

export const OpenAITextToSpeechEditor = ({
  parentName,
}: OpenAITextToSpeechEditorProps) => {
  return (
    <OpenAIDialog name="Flows.OpenAI.Title.TextToSpeech">
      <InputField name={`${parentName}.userMessage`} label="Input Text" />

      <SelectField
        name={`${parentName}.voiceType`}
        label="Voice Type"
        defaultValue="alloy"
        options={Object.keys(voiceTypes).map((k) => ({
          value: k,
          label: voiceTypes[k] as string,
        }))}
      />

      <CustomFieldSelect
        name={`${parentName}.resultCustomFieldId`}
        label="Save response to a custom field"
        allowCreate={true}
      />
    </OpenAIDialog>
  )
}
