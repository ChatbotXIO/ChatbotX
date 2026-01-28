"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Loader2Icon } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { disconnectGeminiAction } from "./actions/disconnect.action"

export const GeminiDisconnectDialog = () => {
  const [open, setOpen] = useState(false)
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const t = useTranslations()
  const router = useRouter()

  const { execute, isPending } = useAction(
    disconnectGeminiAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        setOpen(false)
        router.refresh()
      },
    },
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive">
          {t("actions.disconnect")}
        </Button>
      </DialogTrigger>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.disconnectFeature", {
              feature: t("fields.gemini.label"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("messages.disconnectFeatureDescription", {
              feature: t("fields.gemini.label"),
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <DialogClose asChild>
            <Button size="sm" type="button" variant="ghost">
              {t("actions.cancel")}
            </Button>
          </DialogClose>

          <Button
            disabled={isPending}
            onClick={() => {
              execute()
            }}
            size="sm"
            variant="destructive"
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
