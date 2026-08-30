"use client"

import type {
  AdsConversionRuleResource,
  AdsConversionRuleTrigger,
  AdsConversionRuleTriggerType,
} from "@chatbotx.io/business"
// Narrow subpath import (not the `@chatbotx.io/business` barrel): this is a
// "use client" component, and the barrel re-exports `service.ts`, which
// eagerly pulls the DB client (`env.DATABASE_URL`) into the client bundle —
// see the comment atop `channel-fields.ts`. Type-only imports above stay on
// the root package since `import type` is erased and never triggers that.
import {
  ADS_INTEGRATION_FK_BY_CHANNEL,
  type AdsEligibleChannel,
  perChannelIntegrationIdsOrNull,
} from "@chatbotx.io/business/ads-conversion/channel-fields"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
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
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use, useMemo, useState } from "react"
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

// The rule builder covers every ads-eligible channel (Amendment A1 UI —
// "facebook" is a dead channel value, see FacebookRulePlaceholder below).
type RuleChannel = AdsEligibleChannel

type ConversionEventsViewProps = {
  workspaceId: string
  promises: Promise<[ConversionEventsData]>
  selectedAccount: ConversionEventsData["whatsappIntegrations"][number] | null
  switcherIntegrations: AdsSwitcherData["integrations"]
  whatsappCredentialPublic: AdsSwitcherData["whatsappCredentialPublic"]
  oauthCallbackUrl: AdsSwitcherData["oauthCallbackUrl"]
}

type RuleBuilderIntegration = { id: string; name: string }

/** Normalized shape `templateOptions` (RuleBuilder) reduces both channels'
 * template lists to before filtering by integration — see its doc comment. */
type TemplateCandidate = {
  id: string
  integrationId: unknown
  label: string
}

// Channel × trigger-type allowlist mirrored client-side for the picker UI —
// the server-side allowlist in `assertSupportedTrigger`
// (`packages/business/src/ads-conversion/service.ts`) is the actual guard;
// this only prevents the client from ever offering an option the server
// would reject. Messenger includes `templateSent` per Amendment A1 (backed
// by Messenger message templates, not WABA templates); Instagram excludes it
// — no template entity/step exists for Instagram.
const channelTriggerConfig: Record<
  RuleChannel,
  {
    allowedTriggerTypes: AdsConversionRuleTriggerType[]
    defaultTriggerType: AdsConversionRuleTriggerType
  }
> = {
  instagram: {
    allowedTriggerTypes: ["tagApplied", "keywordMatched", "contactReplied"],
    defaultTriggerType: "tagApplied",
  },
  messenger: {
    allowedTriggerTypes: [
      "templateSent",
      "tagApplied",
      "keywordMatched",
      "contactReplied",
    ],
    defaultTriggerType: "templateSent",
  },
  whatsapp: {
    allowedTriggerTypes: [
      "templateSent",
      "tagApplied",
      "keywordMatched",
      "contactReplied",
    ],
    defaultTriggerType: "templateSent",
  },
}

function buildRuleIntegrationFields(
  channel: RuleChannel,
  integrationId: string,
) {
  return {
    integrationFacebookAdsId: null,
    ...perChannelIntegrationIdsOrNull(channel, integrationId),
  }
}

function ruleMatchesIntegration(
  rule: AdsConversionRuleResource,
  channel: RuleChannel,
  integrationId: string,
): boolean {
  return rule[ADS_INTEGRATION_FK_BY_CHANNEL[channel]] === integrationId
}

type RuleBuilderProps = {
  channel: RuleChannel
  data: ConversionEventsData
  eventType: "lead" | "purchase"
  integrations: RuleBuilderIntegration[]
  onIntegrationChange?: (integrationId: string) => void
  selectedIntegrationId: string
  showIntegrationPicker: boolean
  workspaceId: string
}

type RuleBuilderEventType = RuleBuilderProps["eventType"]

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
  RuleBuilderEventType,
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
} as const satisfies Record<RuleBuilderEventType, string>

function RuleBuilder({
  channel,
  data,
  eventType,
  integrations,
  onIntegrationChange,
  selectedIntegrationId,
  showIntegrationPicker,
  workspaceId,
}: RuleBuilderProps) {
  const t = useTranslations()
  const router = useRouter()
  const config = channelTriggerConfig[channel]
  const [trigger, setTrigger] = useState<AdsConversionRuleTrigger>(() =>
    buildDefaultTrigger(config.defaultTriggerType),
  )
  const copyKeys = ruleBuilderCopyKeys[eventType]
  // Lead's "then" copy names WhatsApp's CTWA terminology explicitly — swap in
  // the channel-neutral variant for Messenger/Instagram rather than reusing
  // WhatsApp-specific wording.
  const thenLabelKey =
    eventType === "lead" && channel !== "whatsapp"
      ? "ads.conversionEvents.trackQualifiedLeads.thenGeneric"
      : copyKeys.thenLabel
  // "Which template confirms a purchase?" is factually wrong on Instagram —
  // no template entity exists there (Amendment A1), so its purchase card
  // opens with the tagApplied trigger and needs template-free wording.
  const questionKey =
    eventType === "purchase" && channel === "instagram"
      ? "ads.conversionEvents.trackPurchases.questionGeneric"
      : copyKeys.question
  const noRulesKey =
    channel === "whatsapp"
      ? "ads.conversionEvents.noRules"
      : "ads.conversionEvents.noRulesGeneric"

  // Only used for the `{id, name}` shape describeTriggerDetail needs — both
  // variants share that, so the union is safe there. `templateOptions` below
  // branches explicitly instead of filtering this union, since WhatsApp and
  // Messenger templates don't share an `integration*Id` field name.
  const templateSource =
    channel === "messenger" ? data.messengerTemplates : data.whatsappTemplates
  const templateOptions = useMemo(() => {
    if (!config.allowedTriggerTypes.includes("templateSent")) {
      return []
    }

    // Normalize each channel's template list to a common
    // `{id, label, integrationId}` shape first — WhatsApp and Messenger
    // templates don't share an `integration*Id` field name — then filter +
    // map that single normalized shape ONCE instead of duplicating the
    // filter/map pipeline per branch.
    const {
      list,
      fkMatcher,
    }: {
      list: TemplateCandidate[]
      fkMatcher: (template: TemplateCandidate) => boolean
    } =
      channel === "messenger"
        ? {
            list: data.messengerTemplates.map(
              (template): TemplateCandidate => ({
                id: template.id,
                integrationId: template.integrationMessengerId,
                label: `${template.name} (${template.language})`,
              }),
            ),
            fkMatcher: (template) =>
              template.integrationId === selectedIntegrationId,
          }
        : {
            list: data.whatsappTemplates.map(
              (template): TemplateCandidate => ({
                id: template.id,
                integrationId: template.integrationWhatsappId,
                label: `${template.name} (${template.language})`,
              }),
            ),
            fkMatcher: (template) =>
              template.integrationId === selectedIntegrationId,
          }

    return list
      .filter(fkMatcher)
      .map((template) => ({ label: template.label, value: template.id }))
  }, [
    channel,
    config.allowedTriggerTypes,
    data.messengerTemplates,
    data.whatsappTemplates,
    selectedIntegrationId,
  ])

  const rules = data.rules.filter(
    (rule) =>
      rule.channel === channel &&
      rule.eventType === eventType &&
      ruleMatchesIntegration(rule, channel, selectedIntegrationId),
  )

  const onSettled = () => router.refresh()
  const createRule = useAction(
    createAdsConversionRuleAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        setTrigger(buildDefaultTrigger(config.defaultTriggerType))
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

        {showIntegrationPicker &&
          (integrations.length > 0 ? (
            <div className="grid max-w-xs gap-2 ps-12">
              <Select
                items={integrations.map((integration) => ({
                  label: integration.name,
                  value: integration.id,
                }))}
                onValueChange={(value) =>
                  onIntegrationChange?.(value as string)
                }
                value={selectedIntegrationId}
              >
                <SelectTrigger
                  aria-label={t("ads.conversionEvents.selectIntegration")}
                  className="w-full"
                >
                  <SelectValue
                    placeholder={t(
                      "ads.conversionEvents.selectIntegrationPlaceholder",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {integrations.map((integration) => (
                    <SelectItem key={integration.id} value={integration.id}>
                      {integration.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex items-center gap-3 ps-12">
              <p className="text-muted-foreground text-sm">
                {t("ads.conversionEvents.noIntegrationsConnected")}
              </p>
              <Link
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={`/space/${workspaceId}/settings/channels`}
              >
                {t("ads.conversionEvents.connectIntegration")}
              </Link>
            </div>
          ))}

        <p className="ps-12 text-muted-foreground text-sm">{t(questionKey)}</p>

        <div className="flex flex-col gap-3 border-border border-s-2 ps-4">
          <div className="flex flex-wrap items-end gap-3">
            <ConversionRuleTriggerPicker
              allowedTriggerTypes={config.allowedTriggerTypes}
              automatedResponses={data.automatedResponses}
              disabled={!selectedIntegrationId}
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
                  channel,
                  ...buildRuleIntegrationFields(channel, selectedIntegrationId),
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
              {t(thenLabelKey)}
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
            <p className="text-muted-foreground text-sm">{t(noRulesKey)}</p>
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
                  {describeTriggerDetail(t, rule.trigger, {
                    automatedResponses: data.automatedResponses,
                    tags: data.tags,
                    templates: templateSource,
                  }) && (
                    <p className="truncate text-muted-foreground text-xs">
                      {describeTriggerDetail(t, rule.trigger, {
                        automatedResponses: data.automatedResponses,
                        tags: data.tags,
                        templates: templateSource,
                      })}
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

function ChannelRulesTabContent({
  channel,
  data,
  integrations,
  onIntegrationChange,
  selectedIntegrationId,
  showIntegrationPicker,
  workspaceId,
}: {
  channel: RuleChannel
  data: ConversionEventsData
  integrations: RuleBuilderIntegration[]
  onIntegrationChange?: (integrationId: string) => void
  selectedIntegrationId: string
  showIntegrationPicker: boolean
  workspaceId: string
}) {
  return (
    <div className="flex flex-col gap-5">
      <RuleBuilder
        channel={channel}
        data={data}
        eventType="lead"
        integrations={integrations}
        onIntegrationChange={onIntegrationChange}
        selectedIntegrationId={selectedIntegrationId}
        showIntegrationPicker={showIntegrationPicker}
        workspaceId={workspaceId}
      />
      <RuleBuilder
        channel={channel}
        data={data}
        eventType="purchase"
        integrations={integrations}
        onIntegrationChange={onIntegrationChange}
        selectedIntegrationId={selectedIntegrationId}
        showIntegrationPicker={showIntegrationPicker}
        workspaceId={workspaceId}
      />
    </div>
  )
}

export function ConversionEventsView({
  workspaceId,
  promises,
  selectedAccount,
  switcherIntegrations,
  whatsappCredentialPublic,
  oauthCallbackUrl,
}: ConversionEventsViewProps) {
  const t = useTranslations()
  const [data] = use(promises)

  // Messenger/Instagram have no page-level account switcher (unlike
  // WhatsApp's `selectedAccount`, driven by the `account` URL param shared
  // with the CAPI connect flow) — each tab defaults to the workspace's first
  // connected integration for that channel.
  const [selectedMessengerId, setSelectedMessengerId] = useState(
    () => data.messengerIntegrations[0]?.id ?? "",
  )
  const [selectedInstagramId, setSelectedInstagramId] = useState(
    () => data.instagramIntegrations[0]?.id ?? "",
  )

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
            oauthCallbackUrl={oauthCallbackUrl}
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
          <TabsTrigger className="py-3" value="messenger">
            {t("ads.conversionEvents.tabs.messenger")}
          </TabsTrigger>
          <TabsTrigger className="py-3" value="instagram">
            {t("ads.conversionEvents.tabs.instagram")}
          </TabsTrigger>
          <TabsTrigger className="py-3" value="facebook">
            {t("ads.conversionEvents.tabs.facebook")}
          </TabsTrigger>
        </TabsList>
        <TabsContent className="pt-4" value="whatsapp">
          <ChannelRulesTabContent
            channel="whatsapp"
            data={data}
            integrations={data.whatsappIntegrations}
            selectedIntegrationId={selectedAccount?.id ?? ""}
            showIntegrationPicker={false}
            workspaceId={workspaceId}
          />
        </TabsContent>
        <TabsContent className="pt-4" value="messenger">
          <ChannelRulesTabContent
            channel="messenger"
            data={data}
            integrations={data.messengerIntegrations}
            onIntegrationChange={setSelectedMessengerId}
            selectedIntegrationId={selectedMessengerId}
            showIntegrationPicker
            workspaceId={workspaceId}
          />
        </TabsContent>
        <TabsContent className="pt-4" value="instagram">
          <ChannelRulesTabContent
            channel="instagram"
            data={data}
            integrations={data.instagramIntegrations}
            onIntegrationChange={setSelectedInstagramId}
            selectedIntegrationId={selectedInstagramId}
            showIntegrationPicker
            workspaceId={workspaceId}
          />
        </TabsContent>
        <TabsContent className="pt-4" value="facebook">
          <FacebookRulePlaceholder />
        </TabsContent>
      </Tabs>
    </div>
  )
}
