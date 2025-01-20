"use client"

import type {
  getOpenAIAgents,
  getOpenAIAssistants,
  getOpenAIPrompt,
} from "@/features/integrations/open-ai/queries"

import { use, useCallback, useEffect, useState } from "react"

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
  prompt: Record<
    string,
    string | number | boolean | Record<string, string | number>[]
  > | null
  agents: Record<string, string | number>[] | []
  changeValue: (
    payload: Record<
      string,
      string | number | boolean | Record<string, string | number>[]
    >,
  ) => void
}

const OptionsFields = ({ prompt, agents, changeValue }: OptionsFieldsProps) => {
  const [isOptions, setIsOptions] = useState<boolean>(false)
  const [maxToken, setMaxToken] = useState<number>(0)
  const [temperature, setTemperature] = useState<number>(0)
  const [model, setModel] = useState<string>("")
  const [trigger, setTrigger] = useState<string>("")

  const [models, setModels] = useState<Record<string, string>[]>([])
  const [triggers, setTriggers] = useState<Record<string, string>[]>([])

  const onToggleOptions = () => setIsOptions(!isOptions)

  const formatOptionsFields = useCallback(() => {
    const models = prompt?.data?.models.map(
      ({
        id,
        name,
        maxlength,
      }: { id: string; name: string; maxlength: number }) => ({
        label: name,
        value: id,
        maxlength,
      }),
    )
    setModels(models)
    setModel(prompt?.data?.model)
    const triggers = agents?.data.map(
      ({ id, name }: { id: string; name: string }) => ({
        label: name,
        value: id,
      }),
    )
    setTriggers(triggers)
    setTrigger(triggers[0].value)
    setMaxToken(prompt?.data?.max_tokens)
    setTemperature(prompt?.data?.temperature)
  }, [prompt, agents])

  useEffect(() => {
    formatOptionsFields()
    return () => {}
  }, [formatOptionsFields])

  useEffect(() => {
    changeValue({
      max_tokens: maxToken,
      temperature,
      model,
      trigger,
    })
  }, [changeValue, maxToken, temperature, model, trigger])

  const renderOptions = () => {
    return (
      <>
        <SingleSelect
          placeholder="Select model Open AI"
          value={model}
          options={models}
          onValueChange={setModel}
        />

        <NumberField value={temperature} onChange={setTemperature} />

        <NumberField value={maxToken} step={1} onChange={setMaxToken} />
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
        onValueChange={setTrigger}
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
  const [assistant, setAssistant] = useState<Record<string, string>[]>([])

  const formatAssistants = useCallback(() => {
    const { data = [] } = assistants
    return data.map(({ id, name }) => ({ label: name, value: id }))
  }, [assistants])

  useEffect(() => {
    setAssistant(formatAssistants)
    return () => {}
  }, [formatAssistants])

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
            prompt={prompt}
            agents={agents}
            changeValue={console.log}
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
            prompt={prompt}
            agents={agents}
            changeValue={console.log}
          />
        </div>
      </TabsContent>

      <TabsContent value="assistant" className="min-h-[300px]">
        <SingleSelect options={assistant} />
      </TabsContent>
    </Tabs>
  )
}
