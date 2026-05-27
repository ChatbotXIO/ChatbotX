"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type ReactElement, useEffect, useState } from "react"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { deleteContactAction } from "../actions/delete-contact.action"

export type ContactUsageCounts = {
  tags: number
  conversations: number
}

type DeleteContactDialogProps = {
  trigger: ReactElement
  ids: string[]
  /**
   * Total de tags + conversas atribuídas aos contatos a deletar. Quando a
   * soma > 0, exige confirmação numérica (mesmo padrão de DeleteTagsDialog
   * #13). Quando omitido ou total = 0, mantém o flow rápido legado.
   */
  usageCounts?: ContactUsageCounts
  onSuccess?: () => void
}

export default function DeleteContactDialog({
  trigger,
  ids,
  usageCounts,
  onSuccess,
}: DeleteContactDialogProps) {
  const t = useTranslations()
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const workspaceId = useWorkspaceId()

  const totalLinked =
    (usageCounts?.tags ?? 0) + (usageCounts?.conversations ?? 0)
  const requiresConfirm = totalLinked > 0
  const expectedConfirm = String(totalLinked)

  const [confirmInput, setConfirmInput] = useState("")
  const isMatch = !requiresConfirm || confirmInput.trim() === expectedConfirm

  useEffect(() => {
    if (!open) {
      setConfirmInput("")
    }
  }, [open])

  const { execute, isPending, isExecuting } = useAction(
    deleteContactAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("fields.contact.label"),
          }),
        )
        setOpen(false)
        if (onSuccess) {
          onSuccess()
        } else {
          router.refresh()
        }
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className={"max-h-screen max-w-md"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.contact.label"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {requiresConfirm
              ? t("contacts.delete.usageDescription", {
                  contactCount: ids.length,
                  tagCount: usageCounts?.tags ?? 0,
                  conversationCount: usageCounts?.conversations ?? 0,
                })
              : t("messages.deleteConfirmation", {
                  feature: t("fields.contact.label"),
                })}
          </DialogDescription>
        </DialogHeader>

        {requiresConfirm && (
          <div className="space-y-2">
            <Label className="text-sm" htmlFor="delete-contact-confirm">
              {t("contacts.delete.confirmInputLabel", {
                count: totalLinked,
              })}
            </Label>
            <Input
              autoComplete="off"
              id="delete-contact-confirm"
              inputMode="numeric"
              onChange={(e) =>
                setConfirmInput(e.target.value.replace(/[^0-9]/g, ""))
              }
              placeholder={expectedConfirm}
              value={confirmInput}
            />
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button size="sm" variant="ghost">
              {t("actions.cancel")}
            </Button>
          </DialogClose>

          <Button
            disabled={isPending || !isMatch}
            onClick={() => execute({ ids })}
            size="sm"
            type="button"
            variant="destructive"
          >
            {isExecuting && <Loader2Icon className="animate-spin" />}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
