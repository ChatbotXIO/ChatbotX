"use client"

import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog"

import { NumberField } from "@/components/number-field"
import { SingleSelect } from "@/components/single-select"

import { OpenAICustomField } from "@/features/flows/react-flow/blocks/open-ai/components/custom-field"
import { OpenAIFormItem } from "@/features/flows/react-flow/blocks/open-ai/components/form-item"
import { OpenAIModel } from "@/features/flows/react-flow/blocks/open-ai/components/model"
import { OpenAITrigger } from "@/features/flows/react-flow/blocks/open-ai/components/trigger"
import { OpenAIUserMessage } from "@/features/flows/react-flow/blocks/open-ai/components/user-message"

interface OpenAIGenerateTextAgentEditorProps {
  parentName: string
}

export const OpenAIGenerateTextAgentEditor = ({
  parentName,
}: OpenAIGenerateTextAgentEditorProps) => {
  return (
    <OpenAIDialog name="Generate Text - Agent">
      <OpenAIModel onValueChange={console.log} />

      <OpenAIFormItem label="Agents">
        <SingleSelect
          value="prompt-1"
          options={[
            {
              label: "prompt-1",
              value: "prompt-1",
            },
            {
              label: "agent-1",
              value: "agent-1",
            },
          ]}
          onValueChange={console.log}
        />
      </OpenAIFormItem>

      <OpenAIUserMessage />

      <OpenAICustomField />

      <OpenAITrigger />

      <OpenAIFormItem label="Remember Conversation">
        <SingleSelect
          value="yes"
          options={[
            {
              label: "Yes",
              value: "yes",
            },
            {
              label: "No",
              value: "no",
            },
          ]}
          onValueChange={console.log}
        />
      </OpenAIFormItem>

      <OpenAIFormItem label="Temperature">
        <NumberField value={0.4} max={2} onChange={console.log} />
      </OpenAIFormItem>

      <OpenAIFormItem label="Maximum number of output tokens" isOptions>
        <NumberField value={250} step={1} max={4096} onChange={console.log} />
      </OpenAIFormItem>
    </OpenAIDialog>
  )
}
