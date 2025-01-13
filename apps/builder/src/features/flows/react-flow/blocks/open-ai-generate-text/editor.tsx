"use client"

import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog"

import { Input } from "@/components/ui/input"

import { FormItem, FormLabel } from "@/components/ui/form"
import { OpenAICustomField } from "@/features/flows/react-flow/blocks/open-ai/components/custom-field"
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
    <OpenAIDialog name="flows.OpenAI.Title.GenerateText">
      <OpenAIModel onValueChange={console.log} />

      <FormItem>
        <FormLabel>
          Business Information (Prompt)
          <span className="text-[12px] text-gray-500 pl-1">(Options)</span>
        </FormLabel>
        <Input />
      </FormItem>

      <OpenAIUserMessage />

      <OpenAICustomField />

      <OpenAITrigger />
    </OpenAIDialog>
  )
}
