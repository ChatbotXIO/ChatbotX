import { Button } from "@/components/ui/button"
import OpenAIPromptTable from "@/features/integrations/open-ai/components/prompt-table"
import {
  getOpenAIAgents,
  getOpenAIIntegration,
} from "@/features/integrations/open-ai/queries"
import { PlusCircleIcon } from "lucide-react"

export default async function OpenAIPromptsPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([
    getOpenAIIntegration({ chatbotId: params.chatbotId as string }),
    getOpenAIAgents({ chatbotId: params.chatbotId as string }),
  ])

  return (
    <div className="border rounded-md">
      <div className="border-b p-2 flex items-center justify-between">
        <h1 className="text-3xl">Agents</h1>
        <div className="">
          <Button type="button">
            <PlusCircleIcon />
            Add
          </Button>
        </div>
      </div>
      <OpenAIPromptTable promises={promises} />
    </div>
  )
}
