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

export const SettingIntegrationOpenAIDialogEdit = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" className="min-w-[250px]">
          <T keyName="settings.integrations.OpenAI.button.edit" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>OpenAI Edit</DialogTitle>
        </DialogHeader>

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
