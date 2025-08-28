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
import { CodeIcon } from "lucide-react"
import { useTranslations } from "next-intl"
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
  const t = useTranslations()
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
      <DialogContent
        className={"max-h-screen overflow-y-scroll lg:max-w-screen-lg"}
      >
        <DialogHeader>
          <DialogTitle>
            {t("dialog.createTitle", { feature: t("fields.flowNode.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div>
          <HoverCard closeDelay={0} openDelay={0}>
            <Label className="font-bold">{t("fields.notes.label")}</Label>
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
              {t("actions.cancel")}
            </Button>
            <Button onClick={editNote} type="submit">
              {t("actions.confirm")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
