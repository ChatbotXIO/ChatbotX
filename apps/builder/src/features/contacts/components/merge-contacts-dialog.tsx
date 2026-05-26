"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@chatbotx.io/ui/components/ui/radio-group"
import { Loader2Icon, UsersIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { mergeContactsAction } from "../actions/merge-contacts.action"
import type { ListContactsItem } from "../schemas/query"

type MergeContactsDialogProps = {
  workspaceId: string
  contacts: ListContactsItem[]
  trigger: ReactNode
  onSuccess?: () => void
}

/**
 * Dialog pra mesclar 2+ contatos selecionados. User escolhe qual fica como
 * primary (radio); os outros viram "duplicates" e são deletados após o merge
 * (tags/customFields/conversations/inboxes/notes migram pro primary).
 *
 * Backend: `mergeContactsAction` → `mergeContacts()` em business (transaction
 * Drizzle única). Audit log CONTACT_MERGED + ContactEvent MERGED no primary.
 */
export function MergeContactsDialog({
  workspaceId,
  contacts,
  trigger,
  onSuccess,
}: MergeContactsDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [primaryId, setPrimaryId] = useState<string>("")

  const { execute, isExecuting } = useAction(
    mergeContactsAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        toast.success(
          t("contacts.merge.success", { count: data?.mergedCount ?? 0 }),
        )
        setOpen(false)
        onSuccess?.()
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const handleConfirm = () => {
    if (!primaryId) {
      return
    }
    const duplicateIds = contacts
      .filter((c) => c.id !== primaryId)
      .map((c) => c.id)
    execute({ primaryId, duplicateIds })
  }

  // Inicializa primaryId no 1º contato ao abrir
  const handleOpenChange = (next: boolean) => {
    if (next && contacts.length > 0 && !primaryId) {
      setPrimaryId(contacts[0].id)
    }
    setOpen(next)
  }

  const canMerge = contacts.length >= 2 && primaryId !== ""

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      {trigger}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersIcon className="size-5 text-primary" />
            {t("contacts.merge.title")}
          </DialogTitle>
          <DialogDescription>
            {t("contacts.merge.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label className="text-sm">{t("contacts.merge.selectPrimary")}</Label>
          <RadioGroup
            className="flex flex-col gap-2"
            onValueChange={setPrimaryId}
            value={primaryId}
          >
            {contacts.map((c) => (
              <label
                className="flex cursor-pointer items-center gap-3 rounded-md border border-white/[0.08] bg-app-surface px-3 py-2 hover:bg-white/[0.04]"
                htmlFor={`merge-primary-${c.id}`}
                key={c.id}
              >
                <RadioGroupItem id={`merge-primary-${c.id}`} value={c.id} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-sm">
                    {c.fullName ||
                      c.phoneNumber ||
                      c.email ||
                      `(${t("contacts.merge.unnamed")})`}
                  </span>
                  <span className="truncate text-muted-foreground text-xs">
                    {[c.phoneNumber, c.email].filter(Boolean).join(" · ") ||
                      "—"}
                  </span>
                </div>
              </label>
            ))}
          </RadioGroup>

          <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
            {t("contacts.merge.warning", { count: contacts.length - 1 })}
          </p>
        </div>

        <DialogFooter>
          <Button
            disabled={isExecuting}
            onClick={() => setOpen(false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!canMerge || isExecuting}
            onClick={handleConfirm}
            size="sm"
            type="button"
          >
            {isExecuting && <Loader2Icon className="animate-spin" />}
            {t("contacts.merge.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
