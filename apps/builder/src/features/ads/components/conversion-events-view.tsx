"use client"

import type { AdsConversionRuleTrigger } from "@chatbotx.io/business"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@chatbotx.io/ui/components/ui/tabs"
import {
  ContactIcon,
  DownloadIcon,
  Loader2Icon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  createAdsConversionRuleAction,
  deleteAdsConversionRuleAction,
  toggleAdsConversionRuleAction,
} from "../actions/conversion-rule"
import type { ConversionEventsData } from "../queries/conversion-rules"
import type { AdsSwitcherData } from "../queries/switcher"
import { AdsAccountControl } from "./ads-account-control"
import {
  buildDefaultTrigger,
  ConversionRuleTriggerPicker,
  describeTriggerDetail,
  describeTriggerLabel,
  isTriggerComplete,
} from "./conversion-rule-trigger-picker"

type ConversionEventsViewProps = {
  workspaceId: string
  promises: Promise<[ConversionEventsData]>
  selectedAccount: ConversionEventsData["whatsappIntegrations"][number] | null
  switcherIntegrations: AdsSwitcherData["integrations"]
  whatsappCredentialPublic: AdsSwitcherData["whatsappCredentialPublic"]
}

type WhatsappRuleBuilderProps = {
  data: ConversionEventsData
  eventType: "lead" | "purchase"
  selectedAccount: ConversionEventsData["whatsappIntegrations"][number] | null
  workspaceId: string
}

type WhatsappRuleEventType = WhatsappRuleBuilderProps["eventType"]

const ruleBuilderCopyKeys = {
  lead: {
    noValueNote: null,
    question: "ads.conversionEvents.trackQualifiedLeads.question",
    thenLabel: "ads.conversionEvents.trackQualifiedLeads.then",
    title: "ads.conversionEvents.trackQualifiedLeads.title",
    when: "ads.conversionEvents.trackQualifiedLeads.when",
  },
  purchase: {
    noValueNote: "ads.conversionEvents.trackPurchases.noValueNote",
    question: "ads.conversionEvents.trackPurchases.question",
    thenLabel: "ads.conversionEvents.trackPurchases.then",
    title: "ads.conversionEvents.trackPurchases.title",
    when: "ads.conversionEvents.trackPurchases.when",
  },
} as const satisfies Record<
  WhatsappRuleEventType,
  {
    noValueNote: string | null
    question: string
    thenLabel: string
    title: string
    when: string
  }
>

const eventTypeLabelKeys = {
  lead: "ads.conversionEvents.eventTypeLead",
  purchase: "ads.conversionEvents.eventTypePurchase",
} as const satisfies Record<WhatsappRuleEventType, string>

function WhatsappRuleBuilder({
  data,
  eventType,
  selectedAccount,
  workspaceId,
}: WhatsappRuleBuilderProps) {
  const t = useTranslations()
  const router = useRouter()
  const selectedIntegrationId = selectedAccount?.id ?? ""
  const [trigger, setTrigger] = useState<AdsConversionRuleTrigger>(() =>
    buildDefaultTrigger("templateSent"),
  )
  const copyKeys = ruleBuilderCopyKeys[eventType]

  const selectedIntegration = selectedAccount
  const templateOptions = useMemo(
    () =>
      data.whatsappTemplates
        .filter(
          (template) =>
            template.integrationWhatsappId === selectedIntegrationId,
        )
        .map((template) => ({
          label: `${template.name} (${template.language})`,
          value: template.id,
        })),
    [data.whatsappTemplates, selectedIntegrationId],
  )
  const rules = data.rules.filter(
    (rule) =>
      rule.integrationWhatsappId === selectedIntegrationId &&
      rule.eventType === eventType,
  )

  useEffect(() => {
    setTrigger(buildDefaultTrigger("templateSent"))
  }, [])

  const onSettled = () => router.refresh()
  const createRule = useAction(
    createAdsConversionRuleAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        setTrigger(buildDefaultTrigger("templateSent"))
        toast.success(t("ads.conversionEvents.messages.ruleSaved"))
        onSettled()
      },
    },
  )
  const toggleRule = useAction(
    toggleAdsConversionRuleAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("ads.conversionEvents.messages.ruleUpdated"))
        onSettled()
      },
    },
  )
  const deleteRule = useAction(
    deleteAdsConversionRuleAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("ads.conversionEvents.messages.ruleDeleted"))
        onSettled()
      },
    },
  )

  const saveDisabled =
    !(selectedIntegrationId && isTriggerComplete(trigger)) ||
    createRule.isPending

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
            <ContactIcon className="size-5 text-primary" />
          </span>
          <h2 className="font-semibold text-base">{t(copyKeys.title)}</h2>
        </div>

        <p className="ps-12 text-muted-foreground text-sm">
          {t(copyKeys.question)}
        </p>

        <div className="flex flex-col gap-3 border-border border-s-2 ps-4">
          <div className="flex flex-wrap items-end gap-3">
            <ConversionRuleTriggerPicker
              automatedResponses={data.automatedResponses}
              disabled={!selectedIntegration}
              onChange={setTrigger}
              tags={data.tags}
              templateOptions={templateOptions}
              value={trigger}
            />

            <Button
              className="gap-2"
              disabled={saveDisabled}
              onClick={() =>
                createRule.execute({
                  channel: "whatsapp",
                  integrationWhatsappId: selectedIntegrationId,
                  integrationFacebookAdsId: null,
                  adAccountId: null,
                  eventType,
                  trigger,
                  markAs: eventType === "lead" ? "deal_won" : null,
                  enabled: true,
                })
              }
            >
              {createRule.isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SaveIcon className="size-4" />
              )}
              {t("actions.save")}
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">
              {t(copyKeys.thenLabel)}
            </span>
            {eventType === "lead" ? (
              <Badge variant="secondary">
                {t("ads.conversionEvents.dealWon")}
              </Badge>
            ) : (
              <span className="text-muted-foreground text-sm">
                {t("ads.conversionEvents.trackPurchases.noValueNote")}
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-3 border-t pt-4">
          <h3 className="font-medium text-sm">
            {t("ads.conversionEvents.existingRules")}
          </h3>
          {rules.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("ads.conversionEvents.noRules")}
            </p>
          ) : (
            rules.map((rule) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                key={rule.id}
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm">
                    {describeTriggerLabel(t, rule.trigger)}
                  </p>
                  {describeTriggerDetail(t, rule.trigger, data) && (
                    <p className="truncate text-muted-foreground text-xs">
                      {describeTriggerDetail(t, rule.trigger, data)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline">
                    {t(eventTypeLabelKeys[rule.eventType])}
                  </Badge>
                  <Switch
                    aria-label={t("ads.conversionEvents.toggleRule")}
                    checked={rule.enabled}
                    disabled={toggleRule.isPending}
                    onCheckedChange={(enabled) =>
                      toggleRule.execute({ id: rule.id, enabled })
                    }
                  />
                  <Button
                    aria-label={t("ads.conversionEvents.deleteRule")}
                    disabled={deleteRule.isPending}
                    onClick={() => deleteRule.execute({ id: rule.id })}
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function FacebookRulePlaceholder() {
  const t = useTranslations()

  // TODO(phase-4): replace this disabled mock UI when Facebook page rules are
  // in scope.
  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-6 opacity-70">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
            <ContactIcon className="size-5 text-primary" />
          </span>
          <h2 className="font-semibold text-base">
            {t("ads.conversionEvents.trackQualifiedLeads.title")}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-border border-s-2 ps-4">
          <span className="text-muted-foreground text-sm">
            {t("ads.conversionEvents.trackQualifiedLeads.when")}
          </span>
          <Button disabled variant="outline">
            {t("ads.conversionEvents.qualifyingTemplateMessageSent")}
          </Button>
          <Button disabled variant="outline">
            {t("ads.conversionEvents.selectAll")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function ConversionEventsView({
  workspaceId,
  promises,
  selectedAccount,
  switcherIntegrations,
  whatsappCredentialPublic,
}: ConversionEventsViewProps) {
  const t = useTranslations()
  const [data] = use(promises)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="font-semibold text-xl">
          {t("ads.conversionEvents.title")}
        </h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button className="gap-1" disabled variant="outline">
            <DownloadIcon className="size-4" />
            {t("ads.conversionEvents.export")}
          </Button>
          <AdsAccountControl
            integrations={switcherIntegrations}
            whatsappCredentialPublic={whatsappCredentialPublic}
            workspaceId={workspaceId}
          />
        </div>
      </div>

      <Tabs defaultValue="whatsapp">
        <TabsList className="px-4">
          <TabsTrigger className="py-3" value="whatsapp">
            {t("ads.conversionEvents.tabs.whatsapp")}
          </TabsTrigger>
          <TabsTrigger className="py-3" value="facebook">
            {t("ads.conversionEvents.tabs.facebook")}
          </TabsTrigger>
        </TabsList>
        <TabsContent className="pt-4" value="whatsapp">
          <div className="flex flex-col gap-5">
            <WhatsappRuleBuilder
              data={data}
              eventType="lead"
              selectedAccount={selectedAccount}
              workspaceId={workspaceId}
            />
            <WhatsappRuleBuilder
              data={data}
              eventType="purchase"
              selectedAccount={selectedAccount}
              workspaceId={workspaceId}
            />
          </div>
        </TabsContent>
        <TabsContent className="pt-4" value="facebook">
          <FacebookRulePlaceholder />
        </TabsContent>
      </Tabs>
    </div>
  )
}
