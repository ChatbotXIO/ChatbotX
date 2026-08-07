"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon, PencilIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { AvatarUploadField } from "@/components/avatar-upload-field"
import { authClient } from "@/lib/auth/auth-client"
import { useUserAvatarUrl } from "@/lib/auth/avatar"

const editProfileSchema = z.object({
  name: z.string().trim().min(1),
  image: z.string().nullable(),
})

type EditProfileDialogProps = {
  user: { name: string | null; email: string; image: string | null }
  className?: string
  triggerClassName?: string
}

export function EditProfileDialog({
  user,
  className,
  triggerClassName,
}: EditProfileDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const form = useForm({
    resolver: zodResolver(editProfileSchema),
    defaultValues: {
      name: user.name ?? "",
      image: user.image,
    },
  })

  const image = form.watch("image")
  const avatarUrl = useUserAvatarUrl(image)
  const displayName = form.watch("name")?.trim() || user.email
  const initials = displayName.slice(0, 2).toUpperCase()

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await authClient.updateUser({
      name: values.name,
      image: values.image,
    })

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(
      t("messages.updatedSuccess", { feature: t("editProfile.title") }),
    )
    setOpen(false)
    router.refresh()
  })

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          form.reset({ name: user.name ?? "", image: user.image })
        }
      }}
      open={open}
    >
      <DialogTrigger
        render={
          <Button
            className={cn(className, triggerClassName)}
            size="icon"
            variant="outline"
          >
            <PencilIcon aria-hidden className="size-4" />
            <span className="sr-only">{t("actions.edit")}</span>
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editProfile.title")}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="flex flex-col items-center gap-2">
              <AvatarUploadField
                alt={displayName}
                fallbackText={initials}
                onUploaded={(filePath) => {
                  form.setValue("image", filePath, { shouldDirty: true })
                }}
                previewUrl={avatarUrl}
                shape="circle"
                uploadLabel={t("actions.uploadFile")}
                uploadPath="avatar"
              />
              <Label className="text-muted-foreground text-xs">
                {t("fields.avatar.label")}
              </Label>
            </div>

            <InputField
              label={t("fields.name.label")}
              name="name"
              placeholder={t("fields.name.placeholder")}
            />

            <div className="flex items-center justify-end gap-2">
              <DialogClose
                render={
                  <Button size="sm" type="button" variant="ghost">
                    {t("actions.cancel")}
                  </Button>
                }
              />
              <Button
                disabled={form.formState.isSubmitting}
                size="sm"
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.save")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
