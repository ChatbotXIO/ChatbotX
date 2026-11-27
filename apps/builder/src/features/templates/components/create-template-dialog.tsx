"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type FormEvent, useState, useTransition } from "react"

const MAX_NAME_LENGTH = 255

/**
 * "Create" asks for the template's name first, then opens the full form with
 * it filled in, so a template is never started without a name.
 */
export function CreateTemplateDialog({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  // Pending until the form page has rendered, so a second click cannot
  // start another navigation while it loads.
  const [isNavigating, startNavigation] = useTransition()
  const trimmedName = name.trim()

  const continueToForm = (event: FormEvent) => {
    event.preventDefault()
    if (!trimmedName || isNavigating) {
      return
    }
    startNavigation(() => {
      router.push(
        `/space/${workspaceId}/templates/create?${new URLSearchParams({ name: trimmedName })}`,
      )
    })
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        {t("actions.create")}
      </DialogTrigger>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={continueToForm}>
          <DialogHeader>
            <DialogTitle>{t("templates.createDialog.title")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-template-name">{t("fields.name.label")}</Label>
            <Input
              autoComplete="off"
              autoFocus
              disabled={isNavigating}
              id="new-template-name"
              maxLength={MAX_NAME_LENGTH}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              {t("actions.cancel")}
            </Button>
            <Button disabled={!trimmedName || isNavigating} type="submit">
              {isNavigating ? <Loader2Icon className="animate-spin" /> : null}
              {t("actions.continue")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
