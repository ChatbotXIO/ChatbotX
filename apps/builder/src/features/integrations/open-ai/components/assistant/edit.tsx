"use client"

import type {
  getOpenAIAssistantByID,
  getOpenAIModels,
  getOpenAITriggers,
} from "@/features/integrations/open-ai/queries"
import { use, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SingleSelect } from "@/components/single-select"
import { MultiSelect } from "@/components/multi-select"

type OpenAIAssistantEditProps = {
  promises: Promise<
    [
      Awaited<ReturnType<typeof getOpenAIAssistantByID>>,
      Awaited<ReturnType<typeof getOpenAITriggers>>,
      Awaited<ReturnType<typeof getOpenAIModels>>,
    ]
  >
}

export default function OpenAIAssistantEdit({
  promises,
}: OpenAIAssistantEditProps) {
  const [assistant, aiTriggers, aiModels] = use(promises)

  const [model, setModel] = useState("")
  const [triggers, seTriggers] = useState<string[]>([""])

  return (
    <>
      <div className="flex items-center justify-end gap-3 p-3 mb-5">
        <Button type="button" variant="secondary">
          Cancel
        </Button>
        <Button type="button">Save</Button>
      </div>

      <div className="flex flex-col gap-2 w-full mr-auto ml-auto p-2 rounded-xl shadow-xl md:w-1/2 md:p-4">
        <div>
          <Label>Name</Label>
          <Input />
        </div>

        <div>
          <Label>
            Instructions{" "}
            <span className="text-xs text-gray-500">(Options)</span>
          </Label>
          <Textarea />
        </div>

        <div>
          <Label>Model</Label>
          <SingleSelect
            placeholder="Select model Open AI"
            value={model}
            options={
              aiModels.data.map((model) => ({
                label: model.name,
                value: model.id,
              })) as { label: string; value: string }[]
            }
            onValueChange={setModel}
          />
        </div>

        <div>
          <Label>
            AI Triggers <span className="text-xs text-gray-500">(Options)</span>
          </Label>
          <MultiSelect
            options={
              aiTriggers.data.map((trigger) => ({
                label: trigger.name,
                value: trigger.id,
              })) as { label: string; value: string }[]
            }
            placeholder="Select AI Triggers"
            variant="inverted"
            animation={2}
            maxCount={3}
            value={triggers}
            onValueChange={seTriggers}
          />
        </div>
      </div>
    </>
  )
}
