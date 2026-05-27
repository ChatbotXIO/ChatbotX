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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { createCategoryAction } from "../actions/create-category.action"
import { updateCategoryAction } from "../actions/update-category.action"
import type { ConversationCategory } from "../queries/list-categories"
import { createCategoryRequest } from "../schemas/action"

type Props = {
  workspaceId: string
  category: ConversationCategory | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CategoryFormDialog({
  workspaceId,
  category,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations()
  const router = useRouter()
  const isEdit = !!category

  const createForm = useHookFormAction(
    createCategoryAction.bind(null, workspaceId),
    zodResolver(createCategoryRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(t("closingNotes.categoryCreated"))
          onOpenChange(false)
          createForm.resetFormAndAction()
          router.refresh()
        },
        onError: ({ error }: { error: { serverError?: string } }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: { name: "", description: "" },
      },
      errorMapProps: {},
    },
  )

  const editForm = useHookFormAction(
    updateCategoryAction.bind(null, workspaceId, category?.id ?? ""),
    zodResolver(createCategoryRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(t("closingNotes.categoryUpdated"))
          onOpenChange(false)
          editForm.resetFormAndAction()
          router.refresh()
        },
        onError: ({ error }: { error: { serverError?: string } }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: { mode: "onChange" },
      errorMapProps: {},
    },
  )

  const { form, handleSubmitWithAction } = isEdit ? editForm : createForm

  useEffect(() => {
    if (isEdit && category) {
      editForm.form.reset({
        name: category.name,
        description: category.description ?? "",
      })
    }
  }, [isEdit, category, editForm.form])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("closingNotes.editCategoryTitle")
              : t("closingNotes.addCategory")}
          </DialogTitle>
          <DialogDescription>
            {t("closingNotes.categoryFormDescription")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.name.label")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("closingNotes.namePlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.description.label")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("closingNotes.descriptionPlaceholder")}
                      rows={3}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                size="sm"
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {isEdit ? t("actions.confirm") : t("actions.create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
