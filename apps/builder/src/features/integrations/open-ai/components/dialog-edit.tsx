import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

import { Button } from "@/components/ui/button"
import { T } from "@tolgee/react"

import TabEdit from "@/features/integrations/open-ai/components/tab-edit"
import {
  getOpenAIAgents,
  getOpenAIAssistants,
  getOpenAIPrompt,
} from "@/features/integrations/open-ai/queries"

type OpenAIDialogEditProps = {
  chatbotId: string
}

export default function OpenAIDialogEdit({ chatbotId }: OpenAIDialogEditProps) {
  const promises = Promise.all([
    getOpenAIPrompt({ chatbotId }),
    getOpenAIAgents({ chatbotId }),
    getOpenAIAssistants({ chatbotId }),
  ])

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

        <TabEdit promises={promises} />

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
