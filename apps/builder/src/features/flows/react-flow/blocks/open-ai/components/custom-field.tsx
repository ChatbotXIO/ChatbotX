"use client"

import { SingleSelect } from "@/components/single-select"
import { Button } from "@/components/ui/button"
import { FormItem, FormLabel } from "@/components/ui/form"

export const OpenAICustomField = () => {
  return (
    <FormItem>
      <FormLabel className="flex items-center justify-between">
        Save response to a custom field
        <Button variant="link" className="p-0">
          Add New
        </Button>
      </FormLabel>
      <SingleSelect
        value="chatgptResponse"
        options={[{ label: "ChatGPT Response", value: "chatgptResponse" }]}
      />
    </FormItem>
  )
}
