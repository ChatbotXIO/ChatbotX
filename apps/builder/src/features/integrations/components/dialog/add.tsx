"use client"

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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { T } from "@tolgee/react"
import { type ReactNode, useEffect, useState } from "react"

type IntegrationDialogAddNameProps = {
  button: ReactNode
  oldName?: string
  title: string
  save: (name: string) => void
}

export default function IntegrationDialogAdd({
  button,
  oldName,
  title,
  save,
}: IntegrationDialogAddNameProps) {
  const [name, setName] = useState<string>("")

  useEffect(() => {
    setName(oldName as string)
  }, [oldName])

  return (
    <Dialog>
      <DialogTrigger asChild>{button}</DialogTrigger>

      <DialogContent className="sm:max-w-[425px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <Label>
          <T keyName="settings.integrations.label.name" />
        </Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>

          <DialogClose asChild>
            <Button type="button" onClick={() => save(name)}>
              Add
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
