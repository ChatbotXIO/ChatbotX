"use client"

import type { TemplateStoreCandidate } from "@chatbotx.io/business"
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
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { MultiSelect } from "@chatbotx.io/ui/components/ui/sersavan/multi-select"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import type { TemplateStoreScope } from "../schema"
import {
  addTemplateStoreListingAction,
  updateTemplateStoreListingAction,
} from "../template-store.action"
import { useTemplateStoreOutcome } from "../use-template-store-outcome"
import { TemplatePicker } from "./template-picker"

type ListingFormDialogProps = {
  scope: TemplateStoreScope
  categories: { id: string; name: string }[]
  /** Set to edit that listing's categories; its template is then fixed. */
  listing?: {
    listingId: string
    templateId: string
    name: string
    categoryIds: string[]
  }
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** Adds a template to the store (pick a template, optionally categories), or edits the categories of a listed one. */
export function ListingFormDialog({
  scope,
  categories,
  listing,
  open: controlledOpen,
  onOpenChange,
}: ListingFormDialogProps) {
  const t = useTranslations("templateStore")
  const tActions = useTranslations("actions")
  const tMessages = useTranslations("messages")
  const handleOutcome = useTemplateStoreOutcome()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const [template, setTemplate] = useState<TemplateStoreCandidate | null>(null)
  const [categoryIds, setCategoryIds] = useState(listing?.categoryIds ?? [])

  const close = () => {
    setOpen(false)
    if (!listing) {
      setTemplate(null)
      setCategoryIds([])
    }
  }

  const add = useAction(addTemplateStoreListingAction, {
    onSuccess: ({ data }) =>
      handleOutcome(data, { successMessage: t("added"), onDone: close }),
    onError: toastActionError(t("saveError")),
  })
  const update = useAction(updateTemplateStoreListingAction, {
    onSuccess: ({ data }) =>
      handleOutcome(data, { successMessage: t("updated"), onDone: close }),
    onError: toastActionError(t("saveError")),
  })
  const isPending = add.isPending || update.isPending
  const canSubmit = !isPending && (listing !== undefined || template !== null)

  const submit = () => {
    if (listing) {
      update.execute({ scope, listingId: listing.listingId, categoryIds })
      return
    }
    if (template) {
      add.execute({ scope, templateId: template.templateId, categoryIds })
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      {listing ? null : (
        <DialogTrigger
          render={
            <Button>
              <PlusIcon className="h-4 w-4" />
              {t("add")}
            </Button>
          }
        />
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{listing ? t("editCategories") : t("add")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("template")}</Label>
            {listing ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <p className="truncate font-medium" title={listing.name}>
                  {listing.name}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t("templateId")}: {listing.templateId}
                </p>
              </div>
            ) : (
              <TemplatePicker
                onChange={setTemplate}
                scope={scope}
                value={template}
              />
            )}
          </div>
          <div className="space-y-2">
            <Label>{t("categories")}</Label>
            <MultiSelect
              defaultValue={categoryIds}
              labels={{
                searchPlaceholder: tActions("search"),
                searchAriaLabel: tActions("search"),
                optionsAriaLabel: t("categories"),
                empty: tMessages("noResults"),
                clear: tActions("clear"),
                clearAllAriaLabel: () => tActions("clear"),
                removeAriaLabel: (name) => t("removeChip", { name }),
                close: t("close"),
                selectAll: () => tActions("selectAll"),
              }}
              modalPopover
              onValueChange={setCategoryIds}
              options={categories.map((category) => ({
                label: category.name,
                value: category.id,
              }))}
              placeholder={t("categoriesPlaceholder")}
            />
            <p className="text-muted-foreground text-xs">
              {categories.length === 0
                ? t("noCategoriesYet")
                : t("categoriesHint")}
            </p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline">
                {tActions("cancel")}
              </Button>
            }
          />
          <Button disabled={!canSubmit} onClick={submit} type="button">
            {listing ? tActions("save") : tActions("continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
