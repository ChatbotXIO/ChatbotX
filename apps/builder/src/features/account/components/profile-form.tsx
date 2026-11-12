"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { AvatarUploadField } from "@/components/avatar-upload-field"
import { authClient } from "@/lib/auth/auth-client"
import { useUserAvatarUrl } from "@/lib/auth/avatar"

const profileSchema = z.object({
  image: z.string().nullable(),
  name: z.string().trim().min(1),
})

type ProfileFormProps = {
  user: { email: string; image: string | null; name: string | null }
}

export const ProfileForm = ({ user }: ProfileFormProps) => {
  const t = useTranslations()
  const router = useRouter()
  const form = useForm({
    defaultValues: {
      image: user.image,
      name: user.name ?? "",
    },
    resolver: zodResolver(profileSchema),
  })
  const image = form.watch("image")
  const avatarUrl = useUserAvatarUrl(image)
  const displayName = form.watch("name")?.trim() || user.email
  const initials = displayName.slice(0, 2).toUpperCase()

  const handleSubmit = form.handleSubmit(async (values) => {
    const { error } = await authClient.updateUser({
      image: values.image,
      name: values.name,
    })

    if (error) {
      toast.error(error.message)
      return
    }

    form.reset(values)
    toast.success(
      t("messages.updatedSuccess", { feature: t("account.profile.title") }),
    )
    router.refresh()
  })

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={handleSubmit}>
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

        <div className="space-y-2">
          <Label htmlFor="email">{t("fields.email.label")}</Label>
          <Input
            id="email"
            name="email"
            readOnly
            type="email"
            value={user.email}
          />
          <p className="text-muted-foreground text-sm">
            {t("account.emailReadOnly")}
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            disabled={!form.formState.isDirty || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting ? (
              <Loader2Icon aria-hidden="true" className="animate-spin" />
            ) : null}
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
