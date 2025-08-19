"use client"

import { openAIGenerateImageSizes } from "@aha.chat/flow-config"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/steps/open-ai/components/dialog"

type OpenAIGenerateImageEditorProps = {
  parentName: string
}

export const OpenAIGenerateImageEditor = (
  props: OpenAIGenerateImageEditorProps,
) => {
  const { parentName } = props

  return (
    <OpenAIDialog name="Flows.OpenAI.Title.GenerateImage">
      <InputField label="User Message" name={`${parentName}.userMessage`} />

      <SelectField
        defaultValue="dall-e-2::1024x1024"
        label="Size"
        name={`${parentName}.size`}
        options={Object.keys(openAIGenerateImageSizes).map((k: string) => ({
          value: k,
          label: openAIGenerateImageSizes[k] as string,
        }))}
      />

      <CustomFieldSelect
        allowCreate={true}
        label="Save response to a custom field"
        name={`${parentName}.resultCustomFieldId`}
      />
    </OpenAIDialog>
  )
}
