"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { LinkIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import z from "zod"
import { useTenantSettings } from "@/features/tenant"
import {
  buildBotSimulatorLink,
  isSimulatorWebsiteAllowed,
  parseSimulatorWebsiteUrl,
} from "../lib/build-simulator-link"

type BotSimulatorWebchat = {
  id: string
  name: string
  enable: boolean
  authorizedDomains: string[]
}

type BotSimulatorFormProps = {
  workspaceId: string
  webchats: BotSimulatorWebchat[]
}

// Mirrors the checks the /bs page makes, so the user never copies a link
// that opens to a 404.
function useBotSimulatorSchema(webchats: BotSimulatorWebchat[]) {
  const t = useTranslations()
  return useMemo(
    () =>
      z
        .object({
          websiteUrl: z
            .string()
            .refine((value) => parseSimulatorWebsiteUrl(value) !== null, {
              message: t("botSimulator.invalidUrl"),
            }),
          webchatId: z.string().min(1, t("botSimulator.webchatRequired")),
        })
        .superRefine((values, context) => {
          const webchat = webchats.find(
            (candidate) => candidate.id === values.webchatId,
          )
          if (!webchat) {
            return
          }
          if (!webchat.enable) {
            context.addIssue({
              code: "custom",
              path: ["webchatId"],
              message: t("botSimulator.webchatDisabled"),
            })
            return
          }
          const websiteUrl = parseSimulatorWebsiteUrl(values.websiteUrl)
          if (
            websiteUrl &&
            !isSimulatorWebsiteAllowed(websiteUrl, webchat.authorizedDomains)
          ) {
            context.addIssue({
              code: "custom",
              path: ["websiteUrl"],
              message: t("botSimulator.domainNotAllowed"),
            })
          }
        }),
    [t, webchats],
  )
}

type BotSimulatorFormValues = z.infer<ReturnType<typeof useBotSimulatorSchema>>

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function BotSimulatorForm({
  workspaceId,
  webchats,
}: BotSimulatorFormProps) {
  const t = useTranslations()
  const schema = useBotSimulatorSchema(webchats)
  const { appUrl } = useTenantSettings()
  const form = useForm<BotSimulatorFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      websiteUrl: "",
      webchatId: webchats.find((webchat) => webchat.enable)?.id ?? "",
    },
  })

  const webchatOptions = webchats.map((webchat) => ({
    value: webchat.id,
    label: webchat.enable
      ? webchat.name
      : t("botSimulator.disabledWebchatLabel", { name: webchat.name }),
    disabled: !webchat.enable,
  }))
  const hasWebchats = webchats.length > 0
  const hasEnabledWebchats = webchats.some((webchat) => webchat.enable)

  const selectedWebchatId = useWatch({
    control: form.control,
    name: "webchatId",
  })
  const selectedAuthorizedDomains =
    webchats.find((webchat) => webchat.id === selectedWebchatId)
      ?.authorizedDomains ?? []
  const websiteUrlValue = useWatch({
    control: form.control,
    name: "websiteUrl",
  })
  const parsedWebsiteUrl = parseSimulatorWebsiteUrl(websiteUrlValue)
  // The /bs page 404s for a website outside the webchat's allowed domains,
  // so block the link as soon as the typed website does not match.
  const isWebsiteDomainBlocked =
    parsedWebsiteUrl !== null &&
    !isSimulatorWebsiteAllowed(parsedWebsiteUrl, selectedAuthorizedDomains)
  const canGetLink = hasEnabledWebchats && !isWebsiteDomainBlocked
  const webchatHint =
    selectedAuthorizedDomains.length > 0
      ? t("botSimulator.allowedDomainsHint", {
          domains: selectedAuthorizedDomains.join(", "),
        })
      : undefined

  const handleGetLink = async (values: BotSimulatorFormValues) => {
    const link = buildBotSimulatorLink({
      appUrl: appUrl || window.location.origin,
      workspaceId,
      webchatId: values.webchatId,
      websiteUrl: values.websiteUrl,
    })
    if (await copyToClipboard(link)) {
      toast.success(t("botSimulator.linkCopied"))
    } else {
      toast.error(t("botSimulator.copyFailed"))
    }
  }

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle>{t("botSimulator.title")}</CardTitle>
        <CardDescription>{t("botSimulator.formDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(handleGetLink)}
          >
            <InputField<BotSimulatorFormValues>
              description={t("botSimulator.websiteLinkHint")}
              label={t("botSimulator.websiteLink")}
              name="websiteUrl"
              placeholder={t("botSimulator.websiteLinkPlaceholder")}
              required
              type="url"
            />
            <SelectField<BotSimulatorFormValues>
              description={webchatHint}
              disabled={!hasEnabledWebchats}
              label={t("fields.webchat.label")}
              name="webchatId"
              options={webchatOptions}
              placeholder={t("botSimulator.selectWebchat")}
              required
            />
            {isWebsiteDomainBlocked ? (
              <p className="text-destructive text-sm">
                {t("botSimulator.domainNotAllowed")}
              </p>
            ) : null}
            {hasEnabledWebchats ? null : (
              <p className="text-muted-foreground text-sm">
                {t(
                  hasWebchats
                    ? "botSimulator.noEnabledWebchat"
                    : "botSimulator.noWebchat",
                )}{" "}
                <Link
                  className="text-primary underline"
                  href={`/space/${workspaceId}/settings/channels/webchat`}
                >
                  {t(
                    hasWebchats
                      ? "botSimulator.enableWebchat"
                      : "botSimulator.createWebchat",
                  )}
                </Link>
              </p>
            )}
            <div className="flex justify-center">
              <Button disabled={!canGetLink} type="submit">
                <LinkIcon className="size-4" />
                {t("botSimulator.getLink")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
