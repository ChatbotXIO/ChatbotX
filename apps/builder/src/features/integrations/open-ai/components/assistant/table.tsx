"use client"

import { use, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { Button } from "@/components/ui/button"
import IntegrationDialogAdd from "@/features/integrations/components/dialog/add"
import { PlusCircleIcon } from "lucide-react"
import { T } from "@tolgee/react"
import type {
  getOpenAIAssistants,
  getOpenAIIntegration,
} from "@/features/integrations/open-ai/queries"

type OpenAIAssistantTableProps = {
  promises: Promise<
    [
      Awaited<ReturnType<typeof getOpenAIIntegration>>,
      Awaited<ReturnType<typeof getOpenAIAssistants>>,
    ]
  >
}

export default function OpenAIAssistantTable({
  promises,
}: OpenAIAssistantTableProps) {
  const [integration, prompts] = use(promises)

  const onAdd = async (name: string) => {
    console.log("Add Name")
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="border-b p-2 flex items-center justify-between">
        <h1 className="text-2xl">Assistants</h1>
        <div className="">
          <IntegrationDialogAdd
            title="Add New"
            save={onAdd}
            button={
              <Button className="min-w-[250px]">
                <PlusCircleIcon />
                <T keyName="settings.integrations.button.add" />
              </Button>
            }
          />
        </div>
      </div>
    </div>
  )
}
