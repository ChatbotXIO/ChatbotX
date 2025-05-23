"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("flows.StepType.AddNote")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div>
          <HoverCard openDelay={0} closeDelay={0}>
            <Label className="font-bold">Input Text</Label>
            <HoverCardTrigger asChild>
              <Textarea
                defaultValue={note}
                maxLength={1000}
                onChange={(event) => setNote(event.target.value)}
              />
            </HoverCardTrigger>
            <HoverCardContent
              className="flex gap-2 p-2 w-auto -mt-3 rounded-tr-none rounded-tl-none"
              side="bottom"
              align="end"
            >
              <HoverCard openDelay={0} closeDelay={0}>
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

          <div className="flex justify-end gap-4 mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel-btn")}
            </Button>
            <Button type="submit" onClick={editNote}>
              {t("common.confirm-btn")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
