"use client"

import { voiceTypes } from "@aha.chat/flow-config"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/steps/open-ai/components/dialog"

type OpenAITextToSpeechEditorProps = {
  parentName: string
}

export const OpenAITextToSpeechEditor = (
  props: OpenAITextToSpeechEditorProps,
) => (
  <OpenAIDialog name="Flows.OpenAI.Title.TextToSpeech">
    <InputField label="Input Text" name={`${props.parentName}.userMessage`} />

    <SelectField
      defaultValue="alloy"
      label="Voice Type"
      name={`${props.parentName}.voiceType`}
      options={Object.keys(voiceTypes).map((k) => ({
        value: k,
        label: voiceTypes[k] as string,
      }))}
    />

    <CustomFieldSelect
      allowCreate={true}
      label="Save response to a custom field"
      name={`${props.parentName}.resultCustomFieldId`}
    />
  </OpenAIDialog>
)
