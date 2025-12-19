"use client"

import type { FolderType } from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { parseAsString, useQueryState } from "nuqs"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { createFolderAction } from "@/features/folders/actions/create-folder.action"
import { createFolderSchema } from "@/features/folders/schemas/action"
import { useFolderStore } from "./provider/folder-store-context"

export function CreateFolderDialog({
  chatbotId,
  folderType,
}: {
  chatbotId: string
  folderType: FolderType
}) {
  const t = useTranslations()
  const router = useRouter()

  const [open, setOpen] = useState(false)

  const [folderId] = useQueryState("folderId", parseAsString)
  const { getAllFolders } = useFolderStore((state) => state)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createFolderAction.bind(null, chatbotId),
      zodResolver(createFolderSchema),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.createdSuccess", {
                feature: t("fields.folder.label"),
              }),
            )
            resetFormAndAction()
            setOpen(false)
            getAllFolders()
            router.refresh()
          },
          onError: ({ error }) => {
            if (error.serverError) {
              toast.error(error.serverError)
            }
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {
            name: "",
            folderType,
            parentId: folderId,
          },
        },
        errorMapProps: {},
      },
    )

  const { setValue } = form

  useEffect(() => {
    setValue("parentId", folderId)
  }, [folderId, setValue])

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t("actions.createFeature", { feature: t("fields.folder.label") })}
        </Button>
      </DialogTrigger>
      <DialogContent className={"max-h-screen max-w-md overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.createFeature", {
              feature: t("fields.folder.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <InputField
                label={t("fields.folder.label")}
                name="name"
                required
              />

              <div className="flex justify-end gap-4">
                <Button
                  onClick={() => setOpen(false)}
                  type="button"
                  variant="ghost"
                >
                  {t("actions.cancel")}
                </Button>
                <Button
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                  type="submit"
                >
                  {form.formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("actions.confirm")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
