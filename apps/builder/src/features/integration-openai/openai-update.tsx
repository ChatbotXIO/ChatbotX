"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import type { AITrigger, AIAgent } from "@ahachat.ai/database"
import { useTranslate } from "@tolgee/react"

type OpenAIUpdateDialogProps = {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  trigger: AITrigger | null
  agent: AIAgent | null
}

export function OpenAIUpdateDialog({
  open,
  onOpenChange,
}: OpenAIUpdateDialogProps) {
  const { t } = useTranslate()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="w-[750px]">
        <DialogHeader>
          <DialogTitle>{t("openai.update.title")}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="agent">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="agent">Agent</TabsTrigger>
            <TabsTrigger value="trigger">Trigger</TabsTrigger>
          </TabsList>

          <TabsContent value="agent">Update Agent</TabsContent>

          <TabsContent value="trigger">Update Trigger</TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
