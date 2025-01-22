"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  getOpenAIAgents,
  getOpenAIIntegration,
} from "@/features/integrations/open-ai/queries"
import { EllipsisVerticalIcon } from "lucide-react"
import { use } from "react"

type OpenAIPromptTableProps = {
  promises: Promise<
    [
      Awaited<ReturnType<typeof getOpenAIIntegration>>,
      Awaited<ReturnType<typeof getOpenAIAgents>>,
    ]
  >
}

export default function OpenAIPromptTable({
  promises,
}: OpenAIPromptTableProps) {
  const [integration, prompts] = use(promises)

  console.log(integration, prompts)

  return integration?.data?.isConnect ? (
    <div className="p-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Modified</TableHead>
            <TableHead className="w-[100px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {prompts?.data?.map((prompt) => (
            <TableRow key={prompt.id}>
              <TableCell>{prompt.name}</TableCell>
              <TableCell>{prompt.update_at}</TableCell>
              <TableCell>
                <EllipsisVerticalIcon />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ) : (
    <p className="mb-2">
      AI agents give you control over how AI answers customers based on your
      business information.
    </p>
  )
}
