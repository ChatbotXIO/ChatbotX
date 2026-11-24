"use client"

import type { TemplateStoreCandidate } from "@chatbotx.io/business"
import {
  knownTemplateChannels,
  type TemplateChannel,
} from "@chatbotx.io/database/partials"
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
import { isLocale, type Locale, locales } from "@chatbotx.io/utils/ui-locale"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { localeMeta } from "@/i18n/config"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import type { TemplateStoreScope } from "../schema"
import {
  addTemplateStoreListingAction,
  updateTemplateStoreListingAction,
} from "../template-store.action"
import { useChannelOptions } from "../use-channel-options"
import { useMultiSelectLabels } from "../use-multi-select-labels"
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
    languages: Locale[]
    channels: TemplateChannel[]
  }
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** Adds a template to the store (pick a template, optionally categories, languages and channels), or edits those of a listed one. */
export function ListingFormDialog({
  scope,
  categories,
  listing,
  open: controlledOpen,
  onOpenChange,
}: ListingFormDialogProps) {
  const t = useTranslations("templateStore")
  const tActions = useTranslations("actions")
  const handleOutcome = useTemplateStoreOutcome()
  const categoryLabels = useMultiSelectLabels(t("categories"))
  const languageLabels = useMultiSelectLabels(t("languages"))
  const channelLabels = useMultiSelectLabels(t("channels"))
  const channelOptions = useChannelOptions()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const [template, setTemplate] = useState<TemplateStoreCandidate | null>(null)
  const [categoryIds, setCategoryIds] = useState(listing?.categoryIds ?? [])
  const [languages, setLanguages] = useState<Locale[]>(listing?.languages ?? [])
  const [channels, setChannels] = useState<TemplateChannel[]>(
    listing?.channels ?? [],
  )

  const close = () => {
    setOpen(false)
    if (!listing) {
      setTemplate(null)
      setCategoryIds([])
      setLanguages([])
      setChannels([])
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
      update.execute({
        scope,
        listingId: listing.listingId,
        categoryIds,
        languages,
        channels,
      })
      return
    }
    if (template) {
      add.execute({
        scope,
        templateId: template.templateId,
        categoryIds,
        languages,
        channels,
      })
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
      {/* `minmax(0, 1fr)`: the default grid track is `auto`, which a long template name (the picker is a nowrap button) stretches past the dialog. */}
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{listing ? t("editListing") : t("add")}</DialogTitle>
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
              labels={categoryLabels}
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
          <div className="space-y-2">
            <Label>{t("languages")}</Label>
            <MultiSelect
              defaultValue={languages}
              labels={languageLabels}
              modalPopover
              onValueChange={(values) => setLanguages(values.filter(isLocale))}
              options={locales.map((locale) => ({
                label: localeMeta[locale].nativeLabel,
                value: locale,
              }))}
              placeholder={t("allLanguages")}
            />
            <p className="text-muted-foreground text-xs">
              {t("languagesHint")}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{t("channels")}</Label>
            <MultiSelect
              defaultValue={channels}
              labels={channelLabels}
              modalPopover
              onValueChange={(values) =>
                setChannels(knownTemplateChannels(values))
              }
              options={channelOptions}
              placeholder={t("store.allChannels")}
            />
            <p className="text-muted-foreground text-xs">{t("channelsHint")}</p>
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
