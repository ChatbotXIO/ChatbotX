"use client"

import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog"

import { SingleSelect } from "@/components/single-select"
import { Input } from "@/components/ui/input"

import { FormItem, FormLabel } from "@/components/ui/form"
import { OpenAICustomField } from "@/features/flows/react-flow/blocks/open-ai/components/custom-field"
import { OpenAIModel } from "@/features/flows/react-flow/blocks/open-ai/components/model"

interface OpenAIAnalyzeImageEditorProps {
  parentName: string
}

export const OpenAIAnalyzeImageEditor = ({
  parentName,
}: OpenAIAnalyzeImageEditorProps) => {
  return (
    <OpenAIDialog name="flows.OpenAI.Title.AnalyzeImage">
      <FormItem>
        <FormLabel>Image</FormLabel>
        <SingleSelect
          value="chat_gpt_response"
          options={[{ value: "chat_gpt_response", label: "ChatGPT Response" }]}
          onValueChange={console.log}
        />
      </FormItem>

      <FormItem>
        <FormLabel>Prompt</FormLabel>
        <Input value="What’s in this image?" onChange={console.log} />
      </FormItem>

      <OpenAIModel onValueChange={console.log} />

      <OpenAICustomField />
    </OpenAIDialog>
  )
}
