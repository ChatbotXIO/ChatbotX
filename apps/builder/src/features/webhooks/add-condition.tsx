"use client"

import {
  type TriggerEventType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { defaultFn as addCustomFieldValueChangedCondition } from "../conditions/schemas/custom-field-value-changed"
import { defaultFn as addDateTimeBaseTriggerCondition } from "../conditions/schemas/date-time-based-trigger"
import {
  createDefaultFn,
  createDefaultFnWithSourceId,
} from "../conditions/schemas/simple-conditions"
import { defaultFn as addTagAppliedCondition } from "../conditions/schemas/tag-applied"
import { defaultFn as addTagRemovedCondition } from "../conditions/schemas/tag-removed"

type ConditionOption = {
  label: string
  value: TriggerEventType
  defaultFn: () => unknown
}

export function AddCondition({
  onAdd,
}: {
  onAdd: (option: ConditionOption) => void
}) {
  const t = useTranslations()
  const options = useMemo(
    () => [
      {
        label: t("fields.tags.label"),
        children: [
          {
            label: t("trigger.conditions.tagApplied"),
            value: triggerEventTypes.enum.tagApplied,
            defaultFn: addTagAppliedCondition,
          },
          {
            label: t("trigger.conditions.tagRemoved"),
            value: triggerEventTypes.enum.tagRemoved,
            defaultFn: addTagRemovedCondition,
          },
        ],
      },
      {
        label: t("fields.customFields.label"),
        children: [
          {
            label: t("trigger.conditions.customFieldValueChanged"),
            value: triggerEventTypes.enum.customFieldValueChanged,
            defaultFn: addCustomFieldValueChangedCondition,
          },
          {
            label: t("trigger.conditions.dateTimeBasedTrigger"),
            value: triggerEventTypes.enum.dateTimeBasedTrigger,
            defaultFn: addDateTimeBaseTriggerCondition,
          },
          {
            label: t("trigger.conditions.conversationTransferredToHuman"),
            value: triggerEventTypes.enum.conversationTransferredToHuman,
            defaultFn: createDefaultFn(
              triggerEventTypes.enum.conversationTransferredToHuman,
            ),
          },
          {
            label: t("trigger.conditions.conversationTransferredToBot"),
            value: triggerEventTypes.enum.conversationTransferredToBot,
            defaultFn: createDefaultFn(
              triggerEventTypes.enum.conversationTransferredToBot,
            ),
          },
          {
            label: t("trigger.conditions.newContact"),
            value: triggerEventTypes.enum.newContact,
            defaultFn: createDefaultFn(triggerEventTypes.enum.newContact),
          },
          {
            label: t("trigger.conditions.contactUnsubscribedFormBroadcast"),
            value: triggerEventTypes.enum.contactUnsubscribedFormBroadcast,
            defaultFn: createDefaultFn(
              triggerEventTypes.enum.contactUnsubscribedFormBroadcast,
            ),
          },
          {
            label: t("trigger.conditions.archived"),
            value: triggerEventTypes.enum.archived,
            defaultFn: createDefaultFn(triggerEventTypes.enum.archived),
          },
          {
            label: t("trigger.conditions.followUp"),
            value: triggerEventTypes.enum.followUp,
            defaultFn: createDefaultFn(triggerEventTypes.enum.followUp),
          },
          {
            label: t("trigger.conditions.conversationAssigned"),
            value: triggerEventTypes.enum.conversationAssigned,
            defaultFn: createDefaultFn(
              triggerEventTypes.enum.conversationAssigned,
            ),
          },
          {
            label: t("trigger.conditions.conversationUnassigned"),
            value: triggerEventTypes.enum.conversationUnassigned,
            defaultFn: createDefaultFn(
              triggerEventTypes.enum.conversationUnassigned,
            ),
          },
        ],
      },

      // {
      //   label: t("fields.whatsapp.label"),
      //   children: [
      //     {
      //       label: t("trigger.conditions.incomingCall"),
      //       value: triggerEventTypes.enum.incomingCall,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.incomingCall,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.missedAudioCall"),
      //       value: triggerEventTypes.enum.missedAudioCall,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.missedAudioCall,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.callEnded"),
      //       value: triggerEventTypes.enum.callEnded,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.callEnded,
      //       }),
      //     },
      //   ],
      // },

      // {
      //   label: t("fields.pipelines.label"),
      //   children: [
      //     {
      //       label: t("trigger.conditions.ticketCreated"),
      //       value: triggerEventTypes.enum.ticketCreated,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.ticketCreated,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.ticketMovedToStage"),
      //       value: triggerEventTypes.enum.ticketMovedToStage,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.ticketMovedToStage,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.ticketValueChanged"),
      //       value: triggerEventTypes.enum.ticketValueChanged,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.ticketValueChanged,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.ticketStatusChanged"),
      //       value: triggerEventTypes.enum.ticketStatusChanged,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.ticketStatusChanged,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.ticketPriorityChanged"),
      //       value: triggerEventTypes.enum.ticketPriorityChanged,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.ticketPriorityChanged,
      //       }),
      //     },
      //   ],
      // },

      {
        label: t("fields.sequences.label"),
        children: [
          {
            label: t("trigger.conditions.subscribedToSequence"),
            value: triggerEventTypes.enum.subscribedToSequence,
            defaultFn: createDefaultFnWithSourceId(
              triggerEventTypes.enum.subscribedToSequence,
            ),
          },
          {
            label: t("trigger.conditions.unsubscribedFromSequence"),
            value: triggerEventTypes.enum.unsubscribedFromSequence,
            defaultFn: createDefaultFnWithSourceId(
              triggerEventTypes.enum.unsubscribedFromSequence,
            ),
          },
        ],
      },

      // {
      //   label: t("fields.ecommerce.label"),
      //   children: [
      //     {
      //       label: t("trigger.conditions.WhatsappShoppingCartSent"),
      //       value: triggerEventTypes.enum.WhatsappShoppingCartSent,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.WhatsappShoppingCartSent,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.userAskedAboutProduct"),
      //       value: triggerEventTypes.enum.userAskedAboutProduct,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.userAskedAboutProduct,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.cartAbandoned"),
      //       value: triggerEventTypes.enum.cartAbandoned,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.cartAbandoned,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.newOrder"),
      //       value: triggerEventTypes.enum.newOrder,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.newOrder,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.orderAccepted"),
      //       value: triggerEventTypes.enum.orderAccepted,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.orderAccepted,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.orderShipped"),
      //       value: triggerEventTypes.enum.orderShipped,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.orderShipped,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.orderConcluded"),
      //       value: triggerEventTypes.enum.orderConcluded,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.orderConcluded,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.orderCancelled"),
      //       value: triggerEventTypes.enum.orderCancelled,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.orderCancelled,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.categoryAddedToCart"),
      //       value: triggerEventTypes.enum.categoryAddedToCart,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.categoryAddedToCart,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.productAddedToCart"),
      //       value: triggerEventTypes.enum.productAddedToCart,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.productAddedToCart,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.productRemovedFromCart"),
      //       value: triggerEventTypes.enum.productRemovedFromCart,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.productRemovedFromCart,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.productOrdered"),
      //       value: triggerEventTypes.enum.productOrdered,
      //       defaultFn: () => ({
      //         type: triggerEventTypes.enum.productOrdered,
      //       }),
      //     },
      //   ],
      // },

      {
        label: t("fields.entryPointLink.label"),
        children: [
          {
            label: t("trigger.conditions.contactReferredANewContact"),
            value: triggerEventTypes.enum.contactReferredANewContact,
            defaultFn: createDefaultFn(
              triggerEventTypes.enum.contactReferredANewContact,
            ),
          },
          {
            label: t("trigger.conditions.contactReferredExistingContact"),
            value: triggerEventTypes.enum.contactReferredExistingContact,
            defaultFn: createDefaultFn(
              triggerEventTypes.enum.contactReferredExistingContact,
            ),
          },
        ],
      },
    ],
    [t],
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <PlusIcon />
          {t("actions.addCondition")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {options.map((option, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: wip
          <div key={index}>
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              {option.label}
            </DropdownMenuLabel>
            {option.children.map((child) => (
              <DropdownMenuItem
                key={child.value}
                onClick={() => {
                  onAdd(child)
                }}
              >
                {child.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
