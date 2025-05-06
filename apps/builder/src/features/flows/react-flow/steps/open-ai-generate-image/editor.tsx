"use client"

import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/steps/open-ai/components/dialog"
import { openAIGenerateImageSizes } from "./schema"
import { InputField } from "@/components/form/input-field"
import { SelectField } from "@/components/form/select-field"

interface OpenAIGenerateImageEditorProps {
  parentName: string
}

export const OpenAIGenerateImageEditor = ({
  parentName,
}: OpenAIGenerateImageEditorProps) => {
  return (
    <OpenAIDialog name="Flows.OpenAI.Title.GenerateImage">
      <InputField label="User Message" name={`${parentName}.userMessage`} />

      <SelectField
        label="Size"
        name={`${parentName}.size`}
        defaultValue="dall-e-2::1024x1024"
        options={Object.keys(openAIGenerateImageSizes).map((k: string) => ({
          value: k,
          label: openAIGenerateImageSizes[k] as string,
        }))}
      />

      <CustomFieldSelect
        label="Save response to a custom field"
        name={`${parentName}.resultCustomFieldId`}
        allowCreate={true}
      />
    </OpenAIDialog>
  )
}
