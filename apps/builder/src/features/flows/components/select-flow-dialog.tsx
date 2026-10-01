"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@chatbotx.io/ui/components/ui/tabs"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useMemo, useState } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { disableBotAction } from "@/features/conversations/actions/disable-bot.action"
import {
  BOT_DISABLE_DURATION_MS,
  isConversationActive,
} from "@/features/conversations/utils/bot-state"
import { createMessageAction } from "@/features/messages/actions/create-message.action"
import {
  useWhatsappTemplatesForInbox,
  WhatsappTemplateSendTab,
} from "@/features/messages/components/whatsapp-template-send-tab"
import { createMessageRequest } from "@/features/messages/schema/mutation"
import {
  useFlowNodesSelectOptions,
  useFlowSelectOptions,
} from "../provider/flow-hook"

export function SelectFlowDialog({
  children,
  title,
  submitText,
  templateStartType,
}: {
  children: React.ReactNode
  title?: string
  submitText?: string
  /**
   * When set, a "Template" tab lists only flows whose first step is a message
   * template of this start type (e.g. WhatsApp). Used by the standby composer,
   * where a partner owns the thread and only templates may be sent.
   */
  templateStartType?: string
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(
    templateStartType ? "template" : "flows",
  )

  const { activeConversationId, conversations, updateConversation } =
    useChatStore((state) => state)

  const conversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  )

  // The WhatsApp inbox backing this conversation.
  const whatsappInboxId = useMemo(
    () =>
      conversation?.contactInboxes.find((ci) => ci.channel === "whatsapp")
        ?.inboxId,
    [conversation],
  )

  // The template tab lists this inbox's approved templates; its integration id
  // (derived from those templates) also scopes the Flow/Node tabs — no separate
  // resolver call, reusing the one query that already works by inbox.
  const { integrationWhatsappId } = useWhatsappTemplatesForInbox(
    conversation?.workspaceId ?? "",
    whatsappInboxId,
    open && Boolean(templateStartType),
  )

  // In the standby composer (templateStartType set) every tab is scoped to this
  // conversation's WhatsApp number: only template-first flows of that
  // integration are sendable while a partner holds the thread, so Flows and
  // Node are narrowed the same way as Template. The normal composer passes no
  // scope, so all flows are offered.
  const scopedFilter = templateStartType
    ? { startType: templateStartType, integrationWhatsappId }
    : undefined
  // Hold the scoped queries until the integration resolves: without it the
  // backend returns an empty list, so an early fetch only re-runs.
  const scopedEnabled =
    open && (!templateStartType || Boolean(integrationWhatsappId))

  const flowOptions = useFlowSelectOptions({
    enabled: scopedEnabled,
    filter: scopedFilter,
  })
  const nodesSelectOptions = useFlowNodesSelectOptions({
    enabled: scopedEnabled,
    filter: scopedFilter,
  })
  const nodeIdToFlowIdMap = useMemo(() => {
    const map: Record<string, string> = {} // Record<nodeId, flowId>

    for (const flowOption of nodesSelectOptions) {
      const flowId = flowOption.value

      for (const nodeOption of flowOption.children) {
        const nodeId = nodeOption.value
        map[nodeId] = flowId
      }
    }

    return map
  }, [nodesSelectOptions])

  const { execute: disableBot } = useAction(
    disableBotAction.bind(null, conversation?.workspaceId ?? ""),
    {
      onSuccess: () => {
        if (conversation) {
          updateConversation(conversation.id, {
            botEnabled: false,
            botResumeAt: new Date(Date.now() + BOT_DISABLE_DURATION_MS),
          })
        }
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createMessageAction.bind(
        null,
        conversation?.workspaceId ?? "",
        conversation?.id ?? "",
      ),
      zodResolver(createMessageRequest),
      {
        actionProps: {
          onSuccess: () => {
            if (conversation && isConversationActive(conversation)) {
              disableBot({ ids: [conversation.id] })
            }
            setOpen(false)
            resetFormAndAction()
          },
          onError: ({ error }) => {
            if (error.serverError) {
              toast.error(error.serverError)
            }
          },
        },
        errorMapProps: {},
      },
    )

  const { control } = form
  const nodeId = useWatch({ control, name: "nodeId" })

  useEffect(() => {
    if (nodeId) {
      form.setValue("flowId", nodeIdToFlowIdMap[nodeId], {
        shouldValidate: true,
      })
    }
  }, [nodeId, form, nodeIdToFlowIdMap])

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={children as React.ReactElement} />
      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title ?? t("actions.sendFlow")}</DialogTitle>
        </DialogHeader>
        <Tabs
          onValueChange={(value) => {
            setActiveTab(value)
            resetFormAndAction()
          }}
          value={activeTab}
        >
          <TabsList
            className={`grid w-full ${
              templateStartType ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
            {templateStartType && (
              <TabsTrigger value="template">
                {t("fields.template.label")}
              </TabsTrigger>
            )}
            <TabsTrigger value="flows">{t("fields.flows.label")}</TabsTrigger>
            <TabsTrigger value="steps">{t("fields.steps.label")}</TabsTrigger>
          </TabsList>

          {/* The template tab sends a real WhatsApp template (its own form),
              so it stays outside the flow/node picker's form. */}
          {templateStartType && (
            <TabsContent className="mt-4" value="template">
              <WhatsappTemplateSendTab
                conversationId={conversation?.id ?? ""}
                inboxId={whatsappInboxId}
                onDone={() => setOpen(false)}
                workspaceId={conversation?.workspaceId ?? ""}
              />
            </TabsContent>
          )}

          <Form {...form}>
            <form className="space-y-5" onSubmit={handleSubmitWithAction}>
              <TabsContent className="mt-4" value="flows">
                <ComboboxField
                  emptyText={t("actions.noRecordFound")}
                  name="flowId"
                  options={flowOptions}
                  placeholder={t("fields.flows.placeholder")}
                  portal={true}
                  required
                />
              </TabsContent>

              <TabsContent className="mt-4" value="steps">
                <ComboboxField
                  emptyText={t("actions.noRecordFound")}
                  name="nodeId"
                  options={nodesSelectOptions}
                  placeholder={t("fields.steps.placeholder")}
                  portal={true}
                  required
                />
              </TabsContent>

              {activeTab !== "template" && (
                <div className="flex justify-end gap-2">
                  <DialogClose
                    render={
                      <Button variant="outline">{t("actions.cancel")}</Button>
                    }
                  />

                  <Button
                    disabled={
                      !form.formState.isValid || form.formState.isSubmitting
                    }
                    type="submit"
                  >
                    {form.formState.isSubmitting && (
                      <Loader2 className="animate-spin" />
                    )}
                    {submitText || t("actions.confirm")}
                  </Button>
                </div>
              )}
            </form>
          </Form>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
