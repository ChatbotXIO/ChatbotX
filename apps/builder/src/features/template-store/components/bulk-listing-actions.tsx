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
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { MultiSelect } from "@chatbotx.io/ui/components/ui/sersavan/multi-select"
import { isLocale, locales } from "@chatbotx.io/utils/ui-locale"
import {
  ChevronDownIcon,
  FolderIcon,
  LanguagesIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { localeMeta } from "@/i18n/config"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import type { TemplateStoreRejection, TemplateStoreScope } from "../schema"
import {
  removeTemplateStoreListingsAction,
  updateTemplateStoreListingsAction,
} from "../template-store.action"
import { useMultiSelectLabels } from "../use-multi-select-labels"
import { useTemplateStoreOutcome } from "../use-template-store-outcome"

/** A checked listing that no longer exists fails the whole action; the selection is cleared so the next one starts fresh. */
export const clearSelectionWhenStale =
  (finish: () => void) => (reason: TemplateStoreRejection) => {
    if (reason === "listingUnavailable") {
      finish()
    }
  }

/** What a bulk dialog sets on every selected listing. */
type BulkListingField = "categories" | "languages"

/** The update each field sends; the other field is left out, so it is kept. */
const BULK_FIELD_PAYLOAD = {
  categories: (values: string[]) => ({ categoryIds: values }),
  languages: (values: string[]) => ({ languages: values.filter(isLocale) }),
} as const satisfies Record<BulkListingField, (values: string[]) => object>

/** The menu entries of the edit button, in order. */
const BULK_FIELD_MENU = [
  { field: "categories", Icon: FolderIcon },
  { field: "languages", Icon: LanguagesIcon },
] as const satisfies readonly {
  field: BulkListingField
  Icon: typeof FolderIcon
}[]

/** The wording of each field's dialog, under `templateStore`. */
const BULK_FIELD_COPY = {
  categories: {
    titleKey: "bulk.setCategories",
    labelKey: "categories",
    hintKey: "bulk.categoriesHint",
    placeholderKey: "categoriesPlaceholder",
  },
  languages: {
    titleKey: "bulk.setLanguages",
    labelKey: "languages",
    hintKey: "bulk.languagesHint",
    placeholderKey: "allLanguages",
  },
} as const satisfies Record<
  BulkListingField,
  {
    titleKey: string
    labelKey: string
    hintKey: string
    placeholderKey: string
  }
>

type BulkListingActionsProps = {
  scope: TemplateStoreScope
  categories: { id: string; name: string }[]
  /** The listings checked in the table, on any page; nothing renders when empty. */
  listingIds: string[]
  /** Clears the selection after a change was saved. */
  onDone: () => void
}

/** The table toolbar's actions on the checked rows: one edit menu (categories or languages) and remove. */
export function BulkListingActions({
  scope,
  categories,
  listingIds,
  onDone,
}: BulkListingActionsProps) {
  const t = useTranslations("templateStore")
  const tActions = useTranslations("actions")
  const [field, setField] = useState<BulkListingField | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  if (listingIds.length === 0) {
    return null
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="outline">
              <PencilIcon aria-hidden="true" className="size-4" />
              {tActions("edit")}
              <ChevronDownIcon aria-hidden="true" className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-52">
          {BULK_FIELD_MENU.map(({ field: menuField, Icon }) => (
            <DropdownMenuItem
              key={menuField}
              onClick={() => setField(menuField)}
            >
              <Icon aria-hidden="true" className="me-2 size-4" />
              {t(BULK_FIELD_COPY[menuField].titleKey)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        onClick={() => setIsRemoving(true)}
        type="button"
        variant="outline"
      >
        <Trash2Icon aria-hidden="true" className="size-4" />
        {t("remove")}
      </Button>
      {field ? (
        <BulkSetDialog
          categories={categories}
          field={field}
          key={field}
          listingIds={listingIds}
          onDone={onDone}
          onOpenChange={(open) => !open && setField(null)}
          scope={scope}
        />
      ) : null}
      {isRemoving ? (
        <BulkRemoveDialog
          listingIds={listingIds}
          onDone={onDone}
          onOpenChange={setIsRemoving}
          scope={scope}
        />
      ) : null}
    </>
  )
}

function BulkSetDialog({
  scope,
  field,
  categories,
  listingIds,
  onDone,
  onOpenChange,
}: {
  scope: TemplateStoreScope
  field: BulkListingField
  categories: { id: string; name: string }[]
  listingIds: string[]
  onDone: () => void
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("templateStore")
  const tActions = useTranslations("actions")
  const handleOutcome = useTemplateStoreOutcome()
  const copy = BULK_FIELD_COPY[field]
  const labels = useMultiSelectLabels(t(copy.labelKey))
  const [values, setValues] = useState<string[]>([])
  const options =
    field === "categories"
      ? categories.map((category) => ({
          label: category.name,
          value: category.id,
        }))
      : locales.map((locale) => ({
          label: localeMeta[locale].nativeLabel,
          value: locale,
        }))
  const finish = () => {
    onOpenChange(false)
    onDone()
  }
  const update = useAction(updateTemplateStoreListingsAction, {
    onSuccess: ({ data }) =>
      handleOutcome(data, {
        successMessage: t("bulk.updated"),
        onDone: finish,
        onRejected: clearSelectionWhenStale(finish),
      }),
    onError: toastActionError(t("saveError")),
  })

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(copy.titleKey)}</DialogTitle>
          <DialogDescription>
            {t(copy.hintKey, { count: listingIds.length })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{t(copy.labelKey)}</Label>
          <MultiSelect
            defaultValue={values}
            labels={labels}
            modalPopover
            onValueChange={setValues}
            options={options}
            placeholder={t(copy.placeholderKey)}
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
          <Button
            disabled={update.isPending}
            onClick={() =>
              update.execute({
                scope,
                listingIds,
                ...BULK_FIELD_PAYLOAD[field](values),
              })
            }
            type="button"
          >
            {tActions("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BulkRemoveDialog({
  scope,
  listingIds,
  onDone,
  onOpenChange,
}: {
  scope: TemplateStoreScope
  listingIds: string[]
  onDone: () => void
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("templateStore")
  const tActions = useTranslations("actions")
  const handleOutcome = useTemplateStoreOutcome()
  const finish = () => {
    onOpenChange(false)
    onDone()
  }
  const { execute, isPending } = useAction(removeTemplateStoreListingsAction, {
    onSuccess: ({ data }) =>
      handleOutcome(data, {
        successMessage: t("bulk.removed"),
        onDone: finish,
        onRejected: clearSelectionWhenStale(finish),
      }),
    onError: toastActionError(t("removeError")),
  })

  return (
    <ConfirmDialog
      confirmLabel={tActions("delete")}
      description={t("bulk.removeDescription", { count: listingIds.length })}
      destructive
      isPending={isPending}
      onConfirm={() => execute({ scope, listingIds })}
      onOpenChange={onOpenChange}
      open
      title={t("bulk.removeTitle")}
    />
  )
}
