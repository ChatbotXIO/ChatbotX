"use client"

import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog"

import { Input } from "@/components/ui/input"

import { OpenAICustomField } from "@/features/flows/react-flow/blocks/open-ai/components/custom-field"
import { OpenAIFormItem } from "@/features/flows/react-flow/blocks/open-ai/components/form-item"
import { OpenAIModel } from "@/features/flows/react-flow/blocks/open-ai/components/model"
import { OpenAITrigger } from "@/features/flows/react-flow/blocks/open-ai/components/trigger"
import { OpenAIUserMessage } from "@/features/flows/react-flow/blocks/open-ai/components/user-message"

interface OpenAIGenerateTextEditorProps {
  parentName: string
}

export const OpenAIGenerateTextEditor = ({
  parentName,
}: OpenAIGenerateTextEditorProps) => {
  return (
    <OpenAIDialog name="Generate Text">
      <OpenAIModel onValueChange={console.log} />

      <OpenAIFormItem label="Business Information (Prompt)" isOptions>
        <Input />
      </OpenAIFormItem>

      <OpenAIUserMessage />

      <OpenAICustomField />

      <OpenAITrigger />
    </OpenAIDialog>
  )
}
