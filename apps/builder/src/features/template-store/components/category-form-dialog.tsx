"use client"

import { TEMPLATE_STORE_CATEGORY_NAME_MAX_LENGTH } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import type { TemplateStoreScope } from "../schema"
import {
  createTemplateStoreCategoryAction,
  renameTemplateStoreCategoryAction,
} from "../template-store.action"
import { useTemplateStoreOutcome } from "../use-template-store-outcome"

type CategoryFormDialogProps = {
  scope: TemplateStoreScope
  /** Set to rename that category instead of creating one. */
  category?: { id: string; name: string }
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CategoryFormDialog({
  scope,
  category,
  open: controlledOpen,
  onOpenChange,
}: CategoryFormDialogProps) {
  const t = useTranslations("templateStore")
  const tActions = useTranslations("actions")
  const tFields = useTranslations("fields")
  const handleOutcome = useTemplateStoreOutcome()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const [name, setName] = useState(category?.name ?? "")

  const close = () => {
    setOpen(false)
    if (!category) {
      setName("")
    }
  }

  const create = useAction(createTemplateStoreCategoryAction, {
    onSuccess: ({ data }) =>
      handleOutcome(data, {
        successMessage: t("categoryCreated"),
        onDone: close,
      }),
    onError: toastActionError(t("saveError")),
  })
  const rename = useAction(renameTemplateStoreCategoryAction, {
    onSuccess: ({ data }) =>
      handleOutcome(data, {
        successMessage: t("categoryUpdated"),
        onDone: close,
      }),
    onError: toastActionError(t("saveError")),
  })
  const isPending = create.isPending || rename.isPending
  const trimmedName = name.trim()

  const submit = () => {
    if (category) {
      rename.execute({ scope, categoryId: category.id, name: trimmedName })
      return
    }
    create.execute({ scope, name: trimmedName })
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      {category ? null : (
        <DialogTrigger
          render={
            <Button className="h-9" size="sm" variant="outline">
              <PlusIcon className="h-4 w-4" />
              {t("addCategory")}
            </Button>
          }
        />
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {category ? t("renameCategory") : t("addCategory")}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (trimmedName && !isPending) {
              submit()
            }
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="template-store-category-name">
              {tFields("name.label")}
            </Label>
            <Input
              id="template-store-category-name"
              maxLength={TEMPLATE_STORE_CATEGORY_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  {tActions("cancel")}
                </Button>
              }
            />
            <Button disabled={!trimmedName || isPending} type="submit">
              {tActions("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
