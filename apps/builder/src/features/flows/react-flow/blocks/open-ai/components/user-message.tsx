"use client"

import { Input } from "@/components/ui/input"
import { OpenAIFormItem } from "@/features/flows/react-flow/blocks/open-ai/components/form-item"

export const OpenAIUserMessage = () => {
  return (
    <OpenAIFormItem label="User Message">
      <Input value="{{last_input}}" onChange={console.log} />
    </OpenAIFormItem>
  )
}
