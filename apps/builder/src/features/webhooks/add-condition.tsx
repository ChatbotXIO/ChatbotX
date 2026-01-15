"use client"

import { TriggerCondition } from "@aha.chat/database/enums"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
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
  value: TriggerCondition
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
            value: TriggerCondition.tagApplied,
            defaultFn: addTagAppliedCondition,
          },
          {
            label: t("trigger.conditions.tagRemoved"),
            value: TriggerCondition.tagRemoved,
            defaultFn: addTagRemovedCondition,
          },
        ],
      },
      {
        label: t("fields.customFields.label"),
        children: [
          {
            label: t("trigger.conditions.customFieldValueChanged"),
            value: TriggerCondition.customFieldValueChanged,
            defaultFn: addCustomFieldValueChangedCondition,
          },
          {
            label: t("trigger.conditions.dateTimeBasedTrigger"),
            value: TriggerCondition.dateTimeBasedTrigger,
            defaultFn: addDateTimeBaseTriggerCondition,
          },
          {
            label: t("trigger.conditions.conversationTransferredToHuman"),
            value: TriggerCondition.conversationTransferredToHuman,
            defaultFn: createDefaultFn(
              TriggerCondition.conversationTransferredToHuman,
            ),
          },
          {
            label: t("trigger.conditions.conversationTransferredToBot"),
            value: TriggerCondition.conversationTransferredToBot,
            defaultFn: createDefaultFn(
              TriggerCondition.conversationTransferredToBot,
            ),
          },
          {
            label: t("trigger.conditions.newContact"),
            value: TriggerCondition.newContact,
            defaultFn: createDefaultFn(TriggerCondition.newContact),
          },
          {
            label: t("trigger.conditions.contactUnsubscribedFormBroadcast"),
            value: TriggerCondition.contactUnsubscribedFormBroadcast,
            defaultFn: createDefaultFn(
              TriggerCondition.contactUnsubscribedFormBroadcast,
            ),
          },
          {
            label: t("trigger.conditions.archived"),
            value: TriggerCondition.archived,
            defaultFn: createDefaultFn(TriggerCondition.archived),
          },
          {
            label: t("trigger.conditions.followUp"),
            value: TriggerCondition.followUp,
            defaultFn: createDefaultFn(TriggerCondition.followUp),
          },
          {
            label: t("trigger.conditions.conversationAssigned"),
            value: TriggerCondition.conversationAssigned,
            defaultFn: createDefaultFn(TriggerCondition.conversationAssigned),
          },
          {
            label: t("trigger.conditions.conversationUnassigned"),
            value: TriggerCondition.conversationUnassigned,
            defaultFn: createDefaultFn(TriggerCondition.conversationUnassigned),
          },
        ],
      },

      // {
      //   label: t("fields.whatsapp.label"),
      //   children: [
      //     {
      //       label: t("trigger.conditions.incomingCall"),
      //       value: TriggerCondition.incomingCall,
      //       defaultFn: () => ({
      //         type: TriggerCondition.incomingCall,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.missedAudioCall"),
      //       value: TriggerCondition.missedAudioCall,
      //       defaultFn: () => ({
      //         type: TriggerCondition.missedAudioCall,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.callEnded"),
      //       value: TriggerCondition.callEnded,
      //       defaultFn: () => ({
      //         type: TriggerCondition.callEnded,
      //       }),
      //     },
      //   ],
      // },

      // {
      //   label: t("fields.pipelines.label"),
      //   children: [
      //     {
      //       label: t("trigger.conditions.ticketCreated"),
      //       value: TriggerCondition.ticketCreated,
      //       defaultFn: () => ({
      //         type: TriggerCondition.ticketCreated,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.ticketMovedToStage"),
      //       value: TriggerCondition.ticketMovedToStage,
      //       defaultFn: () => ({
      //         type: TriggerCondition.ticketMovedToStage,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.ticketValueChanged"),
      //       value: TriggerCondition.ticketValueChanged,
      //       defaultFn: () => ({
      //         type: TriggerCondition.ticketValueChanged,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.ticketStatusChanged"),
      //       value: TriggerCondition.ticketStatusChanged,
      //       defaultFn: () => ({
      //         type: TriggerCondition.ticketStatusChanged,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.ticketPriorityChanged"),
      //       value: TriggerCondition.ticketPriorityChanged,
      //       defaultFn: () => ({
      //         type: TriggerCondition.ticketPriorityChanged,
      //       }),
      //     },
      //   ],
      // },

      {
        label: t("fields.sequences.label"),
        children: [
          {
            label: t("trigger.conditions.subscribedToSequence"),
            value: TriggerCondition.subscribedToSequence,
            defaultFn: createDefaultFnWithSourceId(
              TriggerCondition.subscribedToSequence,
            ),
          },
          {
            label: t("trigger.conditions.unsubscribedFromSequence"),
            value: TriggerCondition.unsubscribedFromSequence,
            defaultFn: createDefaultFnWithSourceId(
              TriggerCondition.unsubscribedFromSequence,
            ),
          },
        ],
      },

      // {
      //   label: t("fields.ecommerce.label"),
      //   children: [
      //     {
      //       label: t("trigger.conditions.WhatsappShoppingCartSent"),
      //       value: TriggerCondition.WhatsappShoppingCartSent,
      //       defaultFn: () => ({
      //         type: TriggerCondition.WhatsappShoppingCartSent,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.userAskedAboutProduct"),
      //       value: TriggerCondition.userAskedAboutProduct,
      //       defaultFn: () => ({
      //         type: TriggerCondition.userAskedAboutProduct,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.cartAbandoned"),
      //       value: TriggerCondition.cartAbandoned,
      //       defaultFn: () => ({
      //         type: TriggerCondition.cartAbandoned,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.newOrder"),
      //       value: TriggerCondition.newOrder,
      //       defaultFn: () => ({
      //         type: TriggerCondition.newOrder,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.orderAccepted"),
      //       value: TriggerCondition.orderAccepted,
      //       defaultFn: () => ({
      //         type: TriggerCondition.orderAccepted,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.orderShipped"),
      //       value: TriggerCondition.orderShipped,
      //       defaultFn: () => ({
      //         type: TriggerCondition.orderShipped,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.orderConcluded"),
      //       value: TriggerCondition.orderConcluded,
      //       defaultFn: () => ({
      //         type: TriggerCondition.orderConcluded,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.orderCancelled"),
      //       value: TriggerCondition.orderCancelled,
      //       defaultFn: () => ({
      //         type: TriggerCondition.orderCancelled,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.categoryAddedToCart"),
      //       value: TriggerCondition.categoryAddedToCart,
      //       defaultFn: () => ({
      //         type: TriggerCondition.categoryAddedToCart,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.productAddedToCart"),
      //       value: TriggerCondition.productAddedToCart,
      //       defaultFn: () => ({
      //         type: TriggerCondition.productAddedToCart,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.productRemovedFromCart"),
      //       value: TriggerCondition.productRemovedFromCart,
      //       defaultFn: () => ({
      //         type: TriggerCondition.productRemovedFromCart,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.productOrdered"),
      //       value: TriggerCondition.productOrdered,
      //       defaultFn: () => ({
      //         type: TriggerCondition.productOrdered,
      //       }),
      //     },
      //   ],
      // },

      {
        label: t("fields.entryPointLink.label"),
        children: [
          {
            label: t("trigger.conditions.contactReferredANewContact"),
            value: TriggerCondition.contactReferredANewContact,
            defaultFn: createDefaultFn(
              TriggerCondition.contactReferredANewContact,
            ),
          },
          {
            label: t("trigger.conditions.contactReferredExistingContact"),
            value: TriggerCondition.contactReferredExistingContact,
            defaultFn: createDefaultFn(
              TriggerCondition.contactReferredExistingContact,
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
