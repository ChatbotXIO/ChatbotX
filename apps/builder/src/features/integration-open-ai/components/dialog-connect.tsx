"use client"

import { NumberField } from "@/components/number-field"
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
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { OpenAIModel } from "@/features/flows/react-flow/blocks/open-ai/open-ai-model-select"
import { T } from "@tolgee/react"
import { type ChangeEvent, useState } from "react"

export const SettingIntegrationOpenAIDialogConnect = () => {
  const [isOptions, setIsOptions] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [apiKey, setApiKey] = useState<string>("")

  const onToggleOptions = () => setIsOptions(!isOptions)

  const onOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setIsOptions(isOpen)
    }
  }

  const onUpdateAPIKey = (e: ChangeEvent<HTMLInputElement>) => {
    setIsLoading(true)
    setTimeout(() => {
      setApiKey(e.target.value)
      setIsLoading(false)
    }, 3000)
  }

  const renderOptions = () => {
    return (
      <>
        {apiKey ? <OpenAIModel name="model" /> : null}
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
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="min-w-[250px]">
          <T keyName="settings.integrations.OpenAI.button.connect" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>OpenAI Connect</DialogTitle>
        </DialogHeader>

        <FormItem>
          <FormLabel>API Key</FormLabel>
          <Input onChange={onUpdateAPIKey} />
        </FormItem>

        {isLoading ? (
          <>
            <Skeleton className="h-4 w-[250px]" />
            <Skeleton className="h-4 w-[200px]" />
          </>
        ) : null}

        {apiKey ? (
          <>
            <FormItem>
              <FormLabel>Business Information (Prompt)</FormLabel>
              <Textarea />
            </FormItem>

            <FormItem>
              <FormLabel>AI Triggers</FormLabel>
              <Input />
            </FormItem>
          </>
        ) : null}

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
