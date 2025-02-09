"use client"

import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog"
import { Controller } from "react-hook-form"
import { voiceTypes } from "./schema"

interface OpenAITextToSpeechEditorProps {
  parentName: string
}

export const OpenAITextToSpeechEditor = ({
  parentName,
}: OpenAITextToSpeechEditorProps) => {
  return (
    <OpenAIDialog name="Flows.OpenAI.Title.TextToSpeech">
      <FormInput name={`${parentName}.userMessage`} label="Input Text" />

      <FormInput name={`${parentName}.voiceType`} label="Voice Type">
        <Controller
          name={`${parentName}.voiceType`}
          render={(field) => (
            <SingleSelect
              value="alloy"
              options={Object.keys(voiceTypes).map((k) => ({
                value: k,
                label: voiceTypes[k] as string,
              }))}
              {...field}
            />
          )}
        />
      </FormInput>

      <CustomFieldSelect
        name={`${parentName}.resultCustomFieldId`}
        label="Save response to a custom field"
        allowCreate={true}
      />
    </OpenAIDialog>
  )
}
