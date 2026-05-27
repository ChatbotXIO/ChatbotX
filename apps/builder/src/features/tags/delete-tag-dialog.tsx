"use client"

import type { TagModel } from "@chatbotx.io/database/types"
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
import { Loader, Trash } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type ComponentPropsWithoutRef, useEffect, useState } from "react"
import { toast } from "sonner"
import { deleteTagAction } from "./actions/delete-tag-action"

type TagWithCount = TagModel & { contactsCount?: number | null }

type DeleteTagsDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  workspaceId: string
  tags: TagWithCount[]
  showTrigger?: boolean
  onSuccess?: () => void
  onOpenChange?: (val: boolean) => void
}

export function DeleteTagsDialog({
  workspaceId,
  tags,
  showTrigger = true,
  onSuccess,
  onOpenChange,
  ...props
}: DeleteTagsDialogProps) {
  const t = useTranslations()
  const router = useRouter()

  // Total de contatos atribuídos somando todas as tags selecionadas. Se 0,
  // não exige confirmação numérica (Respond.io só pede pra tags com uso).
  const totalContacts = tags.reduce(
    (sum, tag) => sum + (tag.contactsCount ?? 0),
    0,
  )
  const requiresConfirm = totalContacts > 0
  const expectedConfirm = String(totalContacts)

  const [confirmInput, setConfirmInput] = useState("")
  const isMatch = !requiresConfirm || confirmInput.trim() === expectedConfirm

  // Limpa o input quando dialog fecha/abre.
  useEffect(() => {
    if (!props.open) {
      setConfirmInput("")
    }
  }, [props.open])

  const { execute, isPending } = useAction(
    deleteTagAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("fields.tag.label"),
          }),
        )
        setConfirmInput("")
        onSuccess?.()
        onOpenChange?.(false)
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Dialog {...props}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Trash aria-hidden="true" className="mr-2 size-4" />
            {t("actions.delete")} ({tags.length})
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className={"max-h-screen max-w-xl overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", {
              feature: t("fields.tag.label"),
            })}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm/6">
            {requiresConfirm
              ? t("tags.delete.usageDescription", {
                  tagCount: tags.length,
                  contactCount: totalContacts,
                })
              : t("messages.deleteConfirmation", {
                  feature: t("fields.tag.label"),
                })}
          </DialogDescription>
        </DialogHeader>

        {requiresConfirm && (
          <div className="space-y-2">
            <Label className="text-sm" htmlFor="delete-tag-confirm">
              {t("tags.delete.confirmInputLabel", {
                count: totalContacts,
              })}
            </Label>
            <Input
              autoComplete="off"
              id="delete-tag-confirm"
              inputMode="numeric"
              onChange={(e) =>
                setConfirmInput(e.target.value.replace(/[^0-9]/g, ""))
              }
              placeholder={expectedConfirm}
              value={confirmInput}
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:space-x-0">
          <DialogClose asChild>
            <Button size="sm" variant="ghost">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            aria-label="Excluir linhas selecionadas"
            disabled={isPending || !isMatch}
            onClick={() =>
              execute({
                ids: (tags ?? []).map((tag) => tag.id),
              })
            }
            size="sm"
            variant="destructive"
          >
            {isPending && (
              <Loader aria-hidden="true" className="mr-2 size-4 animate-spin" />
            )}
            {t("actions.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
