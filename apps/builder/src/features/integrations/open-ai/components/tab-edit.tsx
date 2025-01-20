"use client"
import type {
  getOpenAIAgents,
  getOpenAIAssistants,
  getOpenAIPrompt,
} from "@/features/integrations/open-ai/queries"

import { use, useEffect, useState } from "react"

import { MultiSelect } from "@/components/multi-select"
import { NumberField } from "@/components/number-field"
import { SingleSelect } from "@/components/single-select"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type TabPromptProps = {
  promises: Promise<
    [
      Awaited<ReturnType<typeof getOpenAIPrompt>>,
      Awaited<ReturnType<typeof getOpenAIAgents>>,
      Awaited<ReturnType<typeof getOpenAIAssistants>>,
    ]
  >
}

const EditTabs: Record<string, string>[] = [
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

type OptionsFieldsProps = {
  openAIModel: string
  openAITrigger: string
  models: Record<string, string | number>[]
  triggers: Record<string, string | number>[]
}

const OptionsFields = ({
  openAIModel,
  openAITrigger,
  models,
  triggers,
}: OptionsFieldsProps) => {
  const [isOptions, setIsOptions] = useState<boolean>(false)
  const [model, setModel] = useState<string>("")
  const [trigger, setTrigger] = useState<string>("")

  const onToggleOptions = () => setIsOptions(!isOptions)

  setModel(openAIModel)
  setTrigger(openAITrigger)

  const renderOptions = () => {
    return (
      <>
        <SingleSelect
          placeholder="Select model Open AI"
          value={model}
          options={models}
          onValueChange={console.log}
        />

        <NumberField value={0.5} onChange={console.log} />

        <NumberField value={200} step={1} onChange={console.log} />
      </>
    )
  }

  return (
    <>
      <MultiSelect
        options={triggers}
        placeholder="Select frameworks"
        variant="inverted"
        animation={2}
        maxCount={3}
        value={trigger}
        onValueChange={console.log}
      />

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

export default function TabEdit({ promises }: TabPromptProps) {
  const [prompt, agents, assistants] = use(promises)
  const [models, setModels] = useState<Record<string, string>[]>([])
  const [triggers, setTriggers] = useState<Record<string, string>[]>([])
  const [assistant, setAssistant] = useState<Record<string, string>[]>([])

  console.log(prompt, agents, assistants)

  const formatModels = () => {
    const { data } = prompt

    return data?.models.map(({ id, name, maxlength }) => ({
      label: name,
      value: id,
      maxlength,
    }))
  }

  const formatTriggers = () => {
    const { data = [] } = agents
    return data.map(({ id, name }) => ({ label: name, value: id }))
  }

  const formatAssistants = () => {
    const { data = [] } = assistants
    return data.map(({ id, name }) => ({ label: name, value: id }))
  }

  setModels(formatModels())
  setTriggers(formatTriggers())
  setAssistant(formatAssistants())

  return (
    <Tabs defaultValue="prompt" className="w-full">
      <TabsList className="grid w-full grid-cols-3 bg-transparent">
        {EditTabs.map((tab: Record<string, string>) => (
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
          <OptionsFields
            openAIModel={prompt?.data?.model}
            openAITrigger=""
            models={models}
            triggers={triggers}
          />
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
          <OptionsFields
            openAIModel={prompt?.data?.model}
            openAITrigger=""
            models={models}
            triggers={triggers}
          />
        </div>
      </TabsContent>

      <TabsContent value="assistant" className="min-h-[300px]">
        <SingleSelect options={assistant} />
      </TabsContent>
    </Tabs>
  )
}
