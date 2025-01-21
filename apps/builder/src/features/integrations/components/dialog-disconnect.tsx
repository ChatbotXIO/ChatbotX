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

type IntegrationDialogDisconnectProps = {
  title: string
  disconnect: () => void
}

export const IntegrationDialogDisconnect = ({
  title,
  disconnect,
}: IntegrationDialogDisconnectProps) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive" className="min-w-[250px]">
          <T keyName="settings.integrations.OpenAI.button.edit" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle v-html={title} />
        </DialogHeader>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>

          <Button type="button" variant="destructive" onClick={disconnect}>
            Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
