"use client"

import {
  type StoreSource,
  type TriggerEventType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { pipelineItemEventTypes } from "@/features/conditions/schema/pipeline-item"
import { defaultFn as addContactInfoUpdatedCondition } from "../conditions/schema/contact-info-updated"
import { defaultFn as addCustomFieldValueChangedCondition } from "../conditions/schema/custom-field-value-changed"
import { defaultFn as addDateTimeBaseTriggerCondition } from "../conditions/schema/date-time-based-trigger"
import {
  createDefaultFn,
  createDefaultFnWithOptionalSourceId,
  createDefaultFnWithSourceId,
} from "../conditions/schema/simple-conditions"
import { defaultFn as addTagAppliedCondition } from "../conditions/schema/tag-applied"
import { defaultFn as addTagRemovedCondition } from "../conditions/schema/tag-removed"

type ConditionOption = {
  label: string
  value: TriggerEventType
  defaultFn: () => unknown
}

/**
 * Store events that may be narrowed to one product/category (an optional
 * `sourceId`); the other store events take no filter.
 */
const ECOMMERCE_EVENTS_WITH_OPTIONAL_SOURCE: ReadonlySet<TriggerEventType> =
  new Set([
    triggerEventTypes.enum.shoppingCartSent,
    triggerEventTypes.enum.userAskedAboutProduct,
    triggerEventTypes.enum.productAddedToCart,
    triggerEventTypes.enum.productRemovedFromCart,
    triggerEventTypes.enum.categoryAddedToCart,
    triggerEventTypes.enum.productOrdered,
  ])

// Reference trigger-picker order; the events only ChatbotX has
// (phone/email update, call recorded/transcribed, order paid/refunded) close
// the group they belong to.
const ECOMMERCE_EVENTS = [
  triggerEventTypes.enum.shoppingCartSent,
  triggerEventTypes.enum.userAskedAboutProduct,
  triggerEventTypes.enum.cartAbandoned,
  triggerEventTypes.enum.newOrder,
  triggerEventTypes.enum.orderAccepted,
  triggerEventTypes.enum.orderShipped,
  triggerEventTypes.enum.orderConcluded,
  triggerEventTypes.enum.orderCancelled,
  triggerEventTypes.enum.categoryAddedToCart,
  triggerEventTypes.enum.productAddedToCart,
  triggerEventTypes.enum.productRemovedFromCart,
  triggerEventTypes.enum.productOrdered,
  triggerEventTypes.enum.orderPaid,
  triggerEventTypes.enum.orderRefunded,
] as const

/**
 * WhatsApp catalog events; a Shopify store has no WhatsApp catalog, so they
 * can never fire there.
 */
const WHATSAPP_CATALOG_EVENTS: ReadonlySet<TriggerEventType> = new Set([
  triggerEventTypes.enum.shoppingCartSent,
  triggerEventTypes.enum.userAskedAboutProduct,
])

export function AddCondition({
  onAdd,
  storeSource = "chatbotx",
}: {
  onAdd: (option: ConditionOption) => void
  storeSource?: StoreSource
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
        ],
      },
      // Unlabeled sub-groups, as in the reference picker.
      {
        children: [
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
        ],
      },
      {
        children: [
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
          {
            label: t("trigger.conditions.contactInfoUpdated"),
            value: triggerEventTypes.enum.contactInfoUpdated,
            defaultFn: addContactInfoUpdatedCondition,
          },
        ],
      },

      {
        label: t("fields.whatsapp.label"),
        children: [
          {
            label: t("trigger.conditions.incomingCall"),
            value: triggerEventTypes.enum.incomingCall,
            defaultFn: createDefaultFn(triggerEventTypes.enum.incomingCall),
          },
          {
            label: t("trigger.conditions.missedAudioCall"),
            value: triggerEventTypes.enum.missedAudioCall,
            defaultFn: createDefaultFn(triggerEventTypes.enum.missedAudioCall),
          },
          {
            label: t("trigger.conditions.callEnded"),
            value: triggerEventTypes.enum.callEnded,
            defaultFn: createDefaultFn(triggerEventTypes.enum.callEnded),
          },
          {
            label: t("trigger.conditions.callRecorded"),
            value: triggerEventTypes.enum.callRecorded,
            defaultFn: createDefaultFn(triggerEventTypes.enum.callRecorded),
          },
          {
            label: t("trigger.conditions.callTranscribed"),
            value: triggerEventTypes.enum.callTranscribed,
            defaultFn: createDefaultFn(triggerEventTypes.enum.callTranscribed),
          },
        ],
      },

      {
        label: t("fields.pipelines.label"),
        children: pipelineItemEventTypes.map((type) => ({
          label: t(`trigger.conditions.${type}`),
          value: type,
          defaultFn: createDefaultFnWithOptionalSourceId(type),
        })),
      },

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

      // Store events: chat catalog interactions, the web shop cart and orders.
      {
        label: t("fields.ecommerce.label"),
        children: ECOMMERCE_EVENTS.filter(
          (type) =>
            storeSource !== "shopify" || !WHATSAPP_CATALOG_EVENTS.has(type),
        ).map((type) => ({
          label: t(`trigger.conditions.${type}`),
          value: type,
          defaultFn: ECOMMERCE_EVENTS_WITH_OPTIONAL_SOURCE.has(type)
            ? createDefaultFnWithOptionalSourceId(type)
            : createDefaultFn(type),
        })),
      },

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
    [t, storeSource],
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline">
            <PlusIcon />
            {t("actions.addCondition")}
          </Button>
        }
      />
      <DropdownMenuContent>
        {options.map((option, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: safe index
          <div key={index}>
            {option.label ? (
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  {option.label}
                </DropdownMenuLabel>
              </DropdownMenuGroup>
            ) : null}
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
