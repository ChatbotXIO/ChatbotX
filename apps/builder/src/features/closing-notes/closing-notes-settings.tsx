"use client"

import type { ClosingNotesMode } from "@chatbotx.io/database/partials"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@chatbotx.io/ui/components/ui/radio-group"
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { deleteCategoryAction } from "./actions/delete-category.action"
import { updateClosingNotesModeAction } from "./actions/update-mode.action"
import { CategoryFormDialog } from "./components/category-form-dialog"
import type { ConversationCategory } from "./queries/list-categories"

type Props = {
  workspaceId: string
  categories: ConversationCategory[]
  currentMode: string
}

const MODE_OPTIONS: {
  value: ClosingNotesMode
  labelKey: string
  descKey: string
}[] = [
  {
    value: "disabled",
    labelKey: "closingNotes.mode.disabled",
    descKey: "closingNotes.mode.disabledDesc",
  },
  {
    value: "optional",
    labelKey: "closingNotes.mode.optional",
    descKey: "closingNotes.mode.optionalDesc",
  },
  {
    value: "mandatoryDialog",
    labelKey: "closingNotes.mode.mandatoryDialog",
    descKey: "closingNotes.mode.mandatoryDialogDesc",
  },
  {
    value: "mandatoryBoth",
    labelKey: "closingNotes.mode.mandatoryBoth",
    descKey: "closingNotes.mode.mandatoryBothDesc",
  },
]

export function ClosingNotesSettings({
  workspaceId,
  categories,
  currentMode,
}: Props) {
  const t = useTranslations()
  const router = useRouter()
  const [editingCategory, setEditingCategory] =
    useState<ConversationCategory | null>(null)
  const [deletingCategory, setDeletingCategory] =
    useState<ConversationCategory | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { execute: updateMode, isPending: savingMode } = useAction(
    updateClosingNotesModeAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("closingNotes.modeSaved"))
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  // Delete tem 2 bindArgs (workspaceId + id) — chamada direta async pra evitar
  // wrapper que useAction não tipa bem.
  const deleteCategory = async (id: string) => {
    const res = await deleteCategoryAction.bind(null, workspaceId, id)()
    if (res?.serverError) {
      toast.error(res.serverError)
      return
    }
    toast.success(t("closingNotes.categoryDeleted"))
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">
          {t("closingNotes.title")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("closingNotes.subtitle")}
        </p>
      </header>

      {/* ─── Modo de operação ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="font-medium text-base text-foreground">
            {t("closingNotes.modeTitle")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t("closingNotes.modeSubtitle")}
          </p>
        </div>
        <RadioGroup
          className="gap-3"
          disabled={savingMode}
          onValueChange={(value) =>
            updateMode({ mode: value as ClosingNotesMode })
          }
          value={currentMode}
        >
          {MODE_OPTIONS.map((opt) => (
            <Label
              className="flex cursor-pointer items-start gap-3 rounded-md border border-white/[0.08] bg-app-surface p-3 hover:bg-white/[0.04] has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5"
              htmlFor={`mode-${opt.value}`}
              key={opt.value}
            >
              <RadioGroupItem
                className="mt-0.5"
                id={`mode-${opt.value}`}
                value={opt.value}
              />
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground text-sm">
                  {t(opt.labelKey)}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t(opt.descKey)}
                </span>
              </div>
            </Label>
          ))}
        </RadioGroup>
        {savingMode && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Loader2Icon className="size-3 animate-spin" />
            <span>{t("closingNotes.savingMode")}</span>
          </div>
        )}
      </section>

      {/* ─── Categorias ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-medium text-base text-foreground">
              {t("closingNotes.categoriesTitle")}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t("closingNotes.categoriesSubtitle")}
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="sm" type="button">
            <PlusIcon className="size-4" />
            {t("closingNotes.addCategory")}
          </Button>
        </div>

        {categories.length === 0 ? (
          <div className="rounded-md border border-white/[0.06] border-dashed p-8 text-center">
            <p className="text-muted-foreground text-sm">
              {t("closingNotes.emptyCategories")}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-white/[0.08]">
            {categories.map((cat, idx) => (
              <div
                className={`flex items-center gap-3 bg-app-surface px-4 py-3 ${
                  idx === categories.length - 1
                    ? ""
                    : "border-white/[0.06] border-b"
                }`}
                key={cat.id}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground text-sm">
                    {cat.name}
                  </div>
                  {cat.description && (
                    <div className="truncate text-muted-foreground text-xs">
                      {cat.description}
                    </div>
                  )}
                </div>
                <Button
                  aria-label={t("actions.edit")}
                  onClick={() => setEditingCategory(cat)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <PencilIcon className="size-4" />
                </Button>
                <Button
                  aria-label={t("actions.delete")}
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeletingCategory(cat)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <CategoryFormDialog
        category={null}
        onOpenChange={setCreateOpen}
        open={createOpen}
        workspaceId={workspaceId}
      />
      <CategoryFormDialog
        category={editingCategory}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCategory(null)
          }
        }}
        open={!!editingCategory}
        workspaceId={workspaceId}
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeletingCategory(null)
          }
        }}
        open={!!deletingCategory}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("closingNotes.deleteCategoryTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletingCategory
                ? t("closingNotes.confirmDelete", {
                    name: deletingCategory.name,
                  })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deletingCategory) {
                  await deleteCategory(deletingCategory.id)
                  setDeletingCategory(null)
                }
              }}
            >
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
