"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@aha.chat/ui/components/ui/hover-card"
import { Label } from "@aha.chat/ui/components/ui/label"
import { Textarea } from "@aha.chat/ui/components/ui/textarea"
import { useTranslate } from "@tolgee/react"
import { CodeIcon } from "lucide-react"
import { useState } from "react"
import { useFormContext } from "react-hook-form"

export function EditNoteDialog({
  parentName,
  open,
  onOpenChange,
}: {
  parentName: string
  open: boolean
  onOpenChange: (val: boolean) => void
}) {
  const { t } = useTranslate()
  const { watch, setValue } = useFormContext()
  const text = watch(`${parentName}.message`)
  const [note, setNote] = useState(text)

  const editNote = () => {
    setValue(`${parentName}.message`, note, {
      shouldValidate: true,
    })
    onOpenChange(false)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("flows.StepType.AddNote")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div>
          <HoverCard closeDelay={0} openDelay={0}>
            <Label className="font-bold">Input Text</Label>
            <HoverCardTrigger asChild>
              <Textarea
                defaultValue={note}
                maxLength={1000}
                onChange={(event) => setNote(event.target.value)}
              />
            </HoverCardTrigger>
            <HoverCardContent
              align="end"
              className="-mt-3 flex w-auto gap-2 rounded-tl-none rounded-tr-none p-2"
              side="bottom"
            >
              <HoverCard closeDelay={0} openDelay={0}>
                <HoverCardTrigger asChild>
                  <CodeIcon size={16} />
                </HoverCardTrigger>
                <HoverCardContent className="w-56">
                  {/* {
                injectedVariables && injectedVariables.map((v) => (
                  <DropdownMenuItem onClick={() => onChooseVariable(v)}>{v}</DropdownMenuItem>
                ))
              } */}
                </HoverCardContent>
              </HoverCard>
            </HoverCardContent>
          </HoverCard>

          <div className="mt-4 flex justify-end gap-4">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="ghost"
            >
              {t("common.cancel-btn")}
            </Button>
            <Button onClick={editNote} type="submit">
              {t("common.confirm-btn")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
