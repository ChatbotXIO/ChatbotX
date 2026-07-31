"use client"

import type { MePrivacyData } from "@chatbotx.io/business/system-field"
import { normalizeGender } from "@chatbotx.io/sdk"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import {
  AtSign,
  Clock,
  Download,
  Languages,
  Loader2,
  type LucideIcon,
  Phone,
  Trash2,
  User,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { deleteMeDataAction } from "../actions/delete-me-data.action"
import { maskPii } from "../lib/mask"
import { buildMeDownloadHref, toMeLinkInput } from "../lib/me-link-params"

type MeDataViewProps = {
  data: MePrivacyData
}

type InfoRow = {
  key: string
  Icon: LucideIcon
  label: string
  value: string | null
}

type Translator = ReturnType<typeof useTranslations>

const formatGender = (t: Translator, value: string | null): string =>
  t(`fields.gender.${normalizeGender(value ?? undefined) ?? "unknown"}`)

const formatLocale = (t: Translator, value: string | null): string => {
  if (!value) {
    return t("extensionsMe.unknown")
  }
  const normalized = value.replace("_", "-")
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "language" }).of(normalized) ??
      value
    )
  } catch {
    return value
  }
}

const formatBrowserTime = (): string => {
  const parts = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset",
  }).formatToParts(new Date())
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00"
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00"
  const offset = parts.find((part) => part.type === "timeZoneName")?.value
  return offset ? `${hour}:${minute} (${offset})` : `${hour}:${minute}`
}

const useCurrentTimeLabel = (): string | null => {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    setLabel(formatBrowserTime())
  }, [])
  return label
}

export function MeDataView({ data }: MeDataViewProps) {
  const t = useTranslations()
  const contactName =
    data.contact.fullName ||
    [data.contact.firstName, data.contact.lastName].filter(Boolean).join(" ") ||
    data.sourceId

  const { execute, isPending } = useAction(deleteMeDataAction, {
    onSuccess: () => window.location.reload(),
  })

  const currentTimeLabel = useCurrentTimeLabel()

  const infoRows: InfoRow[] = [
    {
      key: "locale",
      Icon: Languages,
      label: t("extensionsMe.fields.locale"),
      value: formatLocale(t, data.contact.locale),
    },
    {
      key: "gender",
      Icon: User,
      label: t("extensionsMe.fields.gender"),
      value: formatGender(t, data.contact.gender),
    },
    {
      key: "phone",
      Icon: Phone,
      label: t("extensionsMe.fields.phone"),
      value: maskPii(data.contact.phoneNumber),
    },
    {
      key: "email",
      Icon: AtSign,
      label: t("extensionsMe.fields.email"),
      value: maskPii(data.contact.email),
    },
    {
      key: "timezone",
      Icon: Clock,
      label: t("extensionsMe.fields.timezone"),
      value: currentTimeLabel,
    },
  ].filter((row): row is InfoRow & { value: string } => Boolean(row.value))

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground md:py-12">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Card>
          <CardHeader className="flex flex-col items-center gap-2 text-center">
            <Avatar className="size-16">
              {data.contact.avatarUrl ? (
                <AvatarImage alt={contactName} src={data.contact.avatarUrl} />
              ) : null}
              <AvatarFallback>
                {contactName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <CardTitle className="truncate text-xl">{contactName}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {infoRows.map(({ key, Icon, label, value }) => (
                <div className="flex items-center gap-2 text-sm" key={key}>
                  <Icon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="sr-only">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("extensionsMe.sections.tags")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {data.tags.map((tag) => (
                  <Badge key={tag.id} variant="secondary">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("extensionsMe.empty.tags")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("extensionsMe.sections.customFields")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.customFields.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("fields.customField.label")}</TableHead>
                    <TableHead>{t("fields.value.label")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.customFields.map((field) => (
                    <TableRow key={field.name}>
                      <TableCell className="w-40 text-muted-foreground">
                        {field.name}
                      </TableCell>
                      <TableCell className="whitespace-normal break-words font-medium">
                        {field.value}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("extensionsMe.empty.customFields")}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          <a
            className={buttonVariants({
              variant: "secondary",
              className: "w-full",
            })}
            href={buildMeDownloadHref(data.params)}
          >
            <Download aria-hidden="true" />
            {t("extensionsMe.actions.download")}
          </a>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  className="w-full"
                  disabled={isPending}
                  variant="destructive"
                >
                  {isPending ? (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  ) : (
                    <Trash2 aria-hidden="true" />
                  )}
                  {t("extensionsMe.actions.delete")}
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("extensionsMe.deleteDialog.title")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("extensionsMe.deleteDialog.description")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                <Button
                  disabled={isPending}
                  onClick={() => execute(toMeLinkInput(data.params))}
                  variant="destructive"
                >
                  {isPending ? (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  ) : (
                    <Trash2 aria-hidden="true" />
                  )}
                  {t("actions.delete")}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </main>
  )
}
