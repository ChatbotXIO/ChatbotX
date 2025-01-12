"use client"

import { FormItem, FormLabel } from "@/components/ui/form"
import { Input } from "@/components/ui/input"

export const OpenAIUserMessage = () => {
  return (
    <FormItem>
      <FormLabel>User Message</FormLabel>
      <Input value="{{last_input}}" onChange={console.log} />
    </FormItem>
  )
}
