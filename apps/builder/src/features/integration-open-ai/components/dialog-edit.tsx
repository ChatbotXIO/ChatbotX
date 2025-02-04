"use client"

import { NumberField } from "@/components/number-field"
import { SingleSelect } from "@/components/single-select"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { FormItem, FormLabel } from "@/components/ui/form"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { OpenAIModel } from "@/features/flows/react-flow/blocks/open-ai/open-ai-model-select"
import { T } from "@tolgee/react"
import { useState } from "react"

type editTab = {
  label: string
  value: string
}

const editTabs: editTab[] = [
  {
    label: "Business Information (Prompt)",
    value: "prompt",
  },
  {
    label: "Agents",
    value: "agents",
  },
  {
    label: "Assistant",
    value: "assistant",
  },
]

const OptionsFields = () => {
  const [isOptions, setIsOptions] = useState<boolean>(false)

  const onToggleOptions = () => setIsOptions(!isOptions)

  const renderOptions = () => {
    return (
      <>
        <OpenAIModel name="model" />

        <FormItem>
          <FormLabel>Temperature</FormLabel>
          <NumberField value={0.5} onChange={console.log} />
        </FormItem>

        <FormItem>
          <FormLabel>Maximum output tokens</FormLabel>
          <NumberField value={200} step={1} onChange={console.log} />
        </FormItem>
      </>
    )
  }

  return (
    <>
      {isOptions ? (
        renderOptions()
      ) : (
        <div>
          <Button
            className="p-0"
            type="button"
            variant="link"
            onClick={onToggleOptions}
          >
            More Options
          </Button>
        </div>
      )}
    </>
  )
}

export const SettingIntegrationOpenAIDialogEdit = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" className="min-w-[250px]">
          <T keyName="settings.integrations.OpenAI.button.edit" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>OpenAI Edit</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="prompt" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-transparent">
            {editTabs.map((tab: editTab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="data-[state=active]:shadow-none data-[state=active]:bg-transparent border-b-2 border-gray-200 rounded-none data-[state=active]:rounded-none data-[state=active]:border-blue-500"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="prompt" className="min-h-[300px]">
            <div className="flex flex-col gap-4">
              <Textarea
                value="You are a helpful assistant."
                onChange={console.log}
              />
              <OptionsFields />
            </div>
          </TabsContent>

          <TabsContent value="agents" className="min-h-[300px]">
            <div className="flex flex-col gap-4">
              <SingleSelect
                options={[
                  {
                    label: "None",
                    value: "none",
                  },
                ]}
              />
              <OptionsFields />
            </div>
          </TabsContent>

          <TabsContent value="assistant" className="min-h-[300px]">
            <SingleSelect
              options={[
                {
                  label: "None",
                  value: "none",
                },
                {
                  label: "Trợ Lý",
                  value: "tro-ly",
                },
              ]}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>

          <Button type="button">Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
