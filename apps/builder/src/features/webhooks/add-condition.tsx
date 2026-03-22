"use client"

import { Condition } from "@aha.chat/database/enums"
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
  value: Condition
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
            value: Condition.tagApplied,
            defaultFn: addTagAppliedCondition,
          },
          {
            label: t("trigger.conditions.tagRemoved"),
            value: Condition.tagRemoved,
            defaultFn: addTagRemovedCondition,
          },
        ],
      },
      {
        label: t("fields.customFields.label"),
        children: [
          {
            label: t("trigger.conditions.customFieldValueChanged"),
            value: Condition.customFieldValueChanged,
            defaultFn: addCustomFieldValueChangedCondition,
          },
          {
            label: t("trigger.conditions.dateTimeBasedTrigger"),
            value: Condition.dateTimeBasedTrigger,
            defaultFn: addDateTimeBaseTriggerCondition,
          },
          {
            label: t("trigger.conditions.conversationTransferredToHuman"),
            value: Condition.conversationTransferredToHuman,
            defaultFn: createDefaultFn(
              Condition.conversationTransferredToHuman,
            ),
          },
          {
            label: t("trigger.conditions.conversationTransferredToBot"),
            value: Condition.conversationTransferredToBot,
            defaultFn: createDefaultFn(Condition.conversationTransferredToBot),
          },
          {
            label: t("trigger.conditions.newContact"),
            value: Condition.newContact,
            defaultFn: createDefaultFn(Condition.newContact),
          },
          {
            label: t("trigger.conditions.contactUnsubscribedFormBroadcast"),
            value: Condition.contactUnsubscribedFormBroadcast,
            defaultFn: createDefaultFn(
              Condition.contactUnsubscribedFormBroadcast,
            ),
          },
          {
            label: t("trigger.conditions.archived"),
            value: Condition.archived,
            defaultFn: createDefaultFn(Condition.archived),
          },
          {
            label: t("trigger.conditions.followUp"),
            value: Condition.followUp,
            defaultFn: createDefaultFn(Condition.followUp),
          },
          {
            label: t("trigger.conditions.conversationAssigned"),
            value: Condition.conversationAssigned,
            defaultFn: createDefaultFn(Condition.conversationAssigned),
          },
          {
            label: t("trigger.conditions.conversationUnassigned"),
            value: Condition.conversationUnassigned,
            defaultFn: createDefaultFn(Condition.conversationUnassigned),
          },
        ],
      },

      // {
      //   label: t("fields.whatsapp.label"),
      //   children: [
      //     {
      //       label: t("trigger.conditions.incomingCall"),
      //       value: Condition.incomingCall,
      //       defaultFn: () => ({
      //         type: Condition.incomingCall,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.missedAudioCall"),
      //       value: Condition.missedAudioCall,
      //       defaultFn: () => ({
      //         type: Condition.missedAudioCall,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.callEnded"),
      //       value: Condition.callEnded,
      //       defaultFn: () => ({
      //         type: Condition.callEnded,
      //       }),
      //     },
      //   ],
      // },

      // {
      //   label: t("fields.pipelines.label"),
      //   children: [
      //     {
      //       label: t("trigger.conditions.ticketCreated"),
      //       value: Condition.ticketCreated,
      //       defaultFn: () => ({
      //         type: Condition.ticketCreated,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.ticketMovedToStage"),
      //       value: Condition.ticketMovedToStage,
      //       defaultFn: () => ({
      //         type: Condition.ticketMovedToStage,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.ticketValueChanged"),
      //       value: Condition.ticketValueChanged,
      //       defaultFn: () => ({
      //         type: Condition.ticketValueChanged,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.ticketStatusChanged"),
      //       value: Condition.ticketStatusChanged,
      //       defaultFn: () => ({
      //         type: Condition.ticketStatusChanged,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.ticketPriorityChanged"),
      //       value: Condition.ticketPriorityChanged,
      //       defaultFn: () => ({
      //         type: Condition.ticketPriorityChanged,
      //       }),
      //     },
      //   ],
      // },

      {
        label: t("fields.sequences.label"),
        children: [
          {
            label: t("trigger.conditions.subscribedToSequence"),
            value: Condition.subscribedToSequence,
            defaultFn: createDefaultFnWithSourceId(
              Condition.subscribedToSequence,
            ),
          },
          {
            label: t("trigger.conditions.unsubscribedFromSequence"),
            value: Condition.unsubscribedFromSequence,
            defaultFn: createDefaultFnWithSourceId(
              Condition.unsubscribedFromSequence,
            ),
          },
        ],
      },

      // {
      //   label: t("fields.ecommerce.label"),
      //   children: [
      //     {
      //       label: t("trigger.conditions.WhatsappShoppingCartSent"),
      //       value: Condition.WhatsappShoppingCartSent,
      //       defaultFn: () => ({
      //         type: Condition.WhatsappShoppingCartSent,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.userAskedAboutProduct"),
      //       value: Condition.userAskedAboutProduct,
      //       defaultFn: () => ({
      //         type: Condition.userAskedAboutProduct,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.cartAbandoned"),
      //       value: Condition.cartAbandoned,
      //       defaultFn: () => ({
      //         type: Condition.cartAbandoned,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.newOrder"),
      //       value: Condition.newOrder,
      //       defaultFn: () => ({
      //         type: Condition.newOrder,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.orderAccepted"),
      //       value: Condition.orderAccepted,
      //       defaultFn: () => ({
      //         type: Condition.orderAccepted,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.orderShipped"),
      //       value: Condition.orderShipped,
      //       defaultFn: () => ({
      //         type: Condition.orderShipped,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.orderConcluded"),
      //       value: Condition.orderConcluded,
      //       defaultFn: () => ({
      //         type: Condition.orderConcluded,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.orderCancelled"),
      //       value: Condition.orderCancelled,
      //       defaultFn: () => ({
      //         type: Condition.orderCancelled,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.categoryAddedToCart"),
      //       value: Condition.categoryAddedToCart,
      //       defaultFn: () => ({
      //         type: Condition.categoryAddedToCart,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.productAddedToCart"),
      //       value: Condition.productAddedToCart,
      //       defaultFn: () => ({
      //         type: Condition.productAddedToCart,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.productRemovedFromCart"),
      //       value: Condition.productRemovedFromCart,
      //       defaultFn: () => ({
      //         type: Condition.productRemovedFromCart,
      //       }),
      //     },
      //     {
      //       label: t("trigger.conditions.productOrdered"),
      //       value: Condition.productOrdered,
      //       defaultFn: () => ({
      //         type: Condition.productOrdered,
      //       }),
      //     },
      //   ],
      // },

      {
        label: t("fields.entryPointLink.label"),
        children: [
          {
            label: t("trigger.conditions.contactReferredANewContact"),
            value: Condition.contactReferredANewContact,
            defaultFn: createDefaultFn(Condition.contactReferredANewContact),
          },
          {
            label: t("trigger.conditions.contactReferredExistingContact"),
            value: Condition.contactReferredExistingContact,
            defaultFn: createDefaultFn(
              Condition.contactReferredExistingContact,
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
