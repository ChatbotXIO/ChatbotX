"use client"

import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog"

import { SingleSelect } from "@/components/single-select"
import { Input } from "@/components/ui/input"

import { FormItem, FormLabel } from "@/components/ui/form"
import { OpenAICustomField } from "@/features/flows/react-flow/blocks/open-ai/components/custom-field"

interface OpenAITextToSpeechEditorProps {
  parentName: string
}

export const OpenAITextToSpeechEditor = ({
  parentName,
}: OpenAITextToSpeechEditorProps) => {
  return (
    <OpenAIDialog name="flows.OpenAI.Title.TextToSpeech">
      <FormItem>
        <FormLabel>Input Text</FormLabel>
        <Input />
      </FormItem>

      <FormItem>
        <FormLabel>Voice Type</FormLabel>
        <SingleSelect
          value="alloy"
          options={[
            { value: "alloy", label: "Alloy" },
            { value: "echo", label: "Echo" },
            { value: "fable", label: "Fable" },
            { value: "onyx", label: "Onyx" },
            { value: "nova", label: "Nova" },
            { value: "shimmer", label: "Shimmer" },
          ]}
          onValueChange={console.log}
        />
      </FormItem>

      <OpenAICustomField />
    </OpenAIDialog>
  )
}
