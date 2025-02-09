"use client"

import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog"
import { Controller, useFormContext } from "react-hook-form"
import { openAIGenerateImageSizes } from "./schema"

interface OpenAIGenerateImageEditorProps {
  parentName: string
}

export const OpenAIGenerateImageEditor = ({
  parentName,
}: OpenAIGenerateImageEditorProps) => {
  const { control } = useFormContext()

  return (
    <OpenAIDialog name="Flows.OpenAI.Title.GenerateImage">
      <FormInput label="User Message" name={`${parentName}.userMessage`} />

      <FormInput label="Size" name={`${parentName}.size`}>
        <Controller
          control={control}
          name={`${parentName}.size`}
          render={(field) => (
            <SingleSelect
              value="dall-e-2::1024x1024"
              options={Object.keys(openAIGenerateImageSizes).map(
                (k: string) => ({
                  value: k,
                  label: openAIGenerateImageSizes[k] as string,
                }),
              )}
              {...field}
            />
          )}
        />
      </FormInput>

      <CustomFieldSelect
        label="Save response to a custom field"
        name={`${parentName}.resultCustomFieldId`}
        allowCreate={true}
      />
    </OpenAIDialog>
  )
}
