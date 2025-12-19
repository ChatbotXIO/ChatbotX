"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@aha.chat/ui/components/ui/form"
import { Input } from "@aha.chat/ui/components/ui/input"
import { Switch } from "@aha.chat/ui/components/ui/switch"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { createTagAction } from "./actions/create-tag-action"
import { createTagSchema } from "./schemas/create-tag-schema"

type CreateTagDialogProps = {
  chatbotId: string
  folderId: string | null
}

export const CreateTagDialog = ({
  chatbotId,
  folderId,
}: CreateTagDialogProps) => {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createTagAction.bind(null, chatbotId),
      zodResolver(createTagSchema),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.createdSuccess", { feature: t("fields.tag.label") }),
            )
            setOpen(false)
            resetFormAndAction()
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
          defaultValues: {
            name: "",
            folderId,
            syncToMessenger: false,
          },
        },
        errorMapProps: {},
      },
    )

  const { setValue } = form

  useEffect(() => {
    setValue("folderId", folderId)
  }, [folderId, setValue])

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen)
      if (!isOpen) {
        resetFormAndAction()
      }
    },
    [resetFormAndAction],
  )

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t("messages.createFeature", { feature: t("fields.tag.label") })}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-screen max-w-xl overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("messages.createFeature", { feature: t("fields.tag.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-6" onSubmit={handleSubmitWithAction}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.name.label")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("fields.name.label")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="syncToMessenger"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormLabel>{t("fields.syncToMessenger.label")}</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      className="mt-0!"
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button size="sm" type="button" variant="ghost">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>
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
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
