"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { DirectUploadButton } from "@chatbotx.io/ui/components/uploader/direct-upload-button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { CameraIcon, KeyRoundIcon, Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import { useRef, useTransition } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import type { Locale } from "@/i18n/config"
import { authClient } from "@/lib/auth/auth-client"
import { setUserLocale } from "@/lib/locale"
import {
  type ActivityStatus,
  ActivityStatusSelector,
  isActivityStatus,
} from "./activity-status"
import {
  type UpdateAccountRequest,
  updateAccountSchema,
} from "./schema/update-account-schema"

export function ProfileForm() {
  const t = useTranslations("personalSettings.profileSection")
  const tFields = useTranslations("fields")
  const session = authClient.useSession()
  const user = session?.data?.user
  const router = useRouter()

  const currentLocale = useLocale()
  const [, startTransition] = useTransition()

  const uploadTriggerRef = useRef<HTMLButtonElement | null>(null)

  const initialFirst = (user?.name ?? "").split(" ")[0] ?? ""
  const initialLast = (user?.name ?? "").split(" ").slice(1).join(" ")

  const form = useForm<UpdateAccountRequest>({
    // biome-ignore lint/suspicious/noExplicitAny: zod default conflict with RHF input/output types
    resolver: zodResolver(updateAccountSchema) as any,
    mode: "onChange",
    defaultValues: {
      firstName: initialFirst,
      lastName: initialLast,
      locale: (currentLocale as Locale) ?? "en",
    },
    values: user
      ? {
          firstName: initialFirst,
          lastName: initialLast,
          locale: (currentLocale as Locale) ?? "en",
        }
      : undefined,
  })

  const onSubmit = form.handleSubmit(async (values) => {
    const fullName = [values.firstName.trim(), values.lastName?.trim()]
      .filter(Boolean)
      .join(" ")
    const { error } = await authClient.updateUser({ name: fullName })
    if (error) {
      toast.error(error.message ?? "")
      return
    }
    if (values.locale && values.locale !== currentLocale) {
      startTransition(() => {
        setUserLocale(values.locale as Locale)
      })
    }
    toast.success(t("savedSuccess"))
  })

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-[280px_1fr] gap-8">
          {/* Avatar + status à esquerda */}
          <div className="flex flex-col items-center gap-3">
            <button
              className="group relative size-32 overflow-hidden rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={!user}
              onClick={() => uploadTriggerRef.current?.click()}
              title={t("changeAvatar")}
              type="button"
            >
              <Avatar className="size-32 rounded-md">
                <AvatarImage alt={user?.name ?? ""} src={user?.image ?? ""} />
                <AvatarFallback className="rounded-md text-3xl">
                  {(user?.name ?? "?").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <CameraIcon className="size-6" />
                <span className="text-xs">{t("changeAvatar")}</span>
              </div>
            </button>
            <DirectUploadButton
              accept="image/*"
              className="hidden"
              label=""
              maxSize={5_242_880}
              multiple={false}
              onUploadError={(error) => toast.error(error.message)}
              onUploadSuccess={async (_filePath, _file, finalUrl) => {
                const { error } = await authClient.updateUser({
                  image: finalUrl,
                })
                if (error) {
                  toast.error(error.message ?? "")
                  return
                }
                toast.success(t("avatarUpdated"))
                router.refresh()
              }}
              triggerRef={uploadTriggerRef}
              uploadPath={user ? `public/user/${user.id}/avatar` : undefined}
            />
            <ActivityStatusSelector
              current={
                isActivityStatus(
                  (user as unknown as { activityStatus?: unknown })
                    ?.activityStatus,
                )
                  ? (user as unknown as { activityStatus: ActivityStatus })
                      .activityStatus
                  : "available"
              }
            />
          </div>

          {/* Campos à direita */}
          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 block">{tFields("email.label")}</Label>
              <input
                className="flex h-9 w-full rounded-md border border-input bg-input/30 px-3 py-1 text-sm shadow-xs disabled:opacity-60"
                defaultValue={user?.email ?? ""}
                disabled
                type="email"
              />
            </div>

            <InputField label={t("firstNameLabel")} name="firstName" required />
            <InputField label={t("lastNameLabel")} name="lastName" />

            <SelectField
              label={t("languageLabel")}
              name="locale"
              options={[
                { value: "pt-BR", label: tFields("language.portuguese") },
                { value: "en", label: tFields("language.english") },
                { value: "vi", label: tFields("language.vietnamese") },
              ]}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button asChild type="button" variant="outline">
                <Link href="/auth/forgot-password">
                  <KeyRoundIcon className="size-4" />
                  {t("changePassword")}
                </Link>
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
                {t("saveProfile")}
              </Button>
            </div>
          </div>
        </div>

        {/* 2FA */}
        <hr className="my-6 border-white/[0.08]" />
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground text-sm">
            {t("twoFA.title")}
          </h3>
          <div className="flex items-center gap-3">
            <Switch disabled />
            <span className="text-foreground text-sm">{t("twoFA.toggle")}</span>
          </div>
        </div>

        {/* Modo escuro */}
        <hr className="my-6 border-white/[0.08]" />
        <DarkModeCards />
      </form>
    </Form>
  )
}

// Helper top-level pra evitar nested ternary (regra biome noNestedTernary).
function getThemePreviewBg(opt: {
  isDark: boolean
  isSplit?: boolean
}): string {
  if (opt.isSplit) {
    return "bg-gradient-to-r from-50% from-white to-50% to-zinc-900"
  }
  return opt.isDark ? "bg-zinc-900" : "bg-white"
}

function DarkModeCards() {
  const t = useTranslations("personalSettings.profileSection.darkMode")
  const { theme, setTheme } = useTheme()
  const active = theme ?? "system"

  const options: {
    value: "system" | "light" | "dark"
    label: string
    isDark: boolean
    isSplit?: boolean
  }[] = [
    { value: "system", label: t("system"), isDark: false, isSplit: true },
    { value: "light", label: t("light"), isDark: false },
    { value: "dark", label: t("dark"), isDark: true },
  ]

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground text-sm">{t("title")}</h3>
      <div className="grid max-w-2xl grid-cols-3 gap-4">
        {options.map((opt) => (
          <button
            className={cn(
              "flex flex-col items-stretch gap-2 rounded-md border-2 p-1 text-left transition",
              active === opt.value
                ? "border-primary"
                : "border-transparent hover:border-white/[0.12]",
            )}
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            type="button"
          >
            <div
              className={cn(
                "relative h-24 overflow-hidden rounded-sm",
                getThemePreviewBg(opt),
              )}
            >
              {/* placeholder UI */}
              <div className="flex gap-1 p-2">
                <span
                  className={cn(
                    "h-1 w-12 rounded",
                    opt.isDark ? "bg-zinc-700" : "bg-zinc-300",
                  )}
                />
              </div>
              <div className="flex gap-1 px-2">
                <span
                  className={cn(
                    "h-1 w-8 rounded",
                    opt.isDark ? "bg-zinc-700" : "bg-zinc-300",
                  )}
                />
              </div>
            </div>
            <span className="text-center text-foreground text-sm">
              {opt.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
