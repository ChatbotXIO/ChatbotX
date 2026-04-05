import {
  type TriggerAction,
  type TriggerEventType,
  triggerActions,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type ReactNode, useMemo } from "react"

export const BaseEditor = ({
  conditionType,
  actionType,
  onRemove,
  children,
}: {
  conditionType?: TriggerEventType
  actionType?: TriggerAction
  children: ReactNode
  onRemove: () => void
}) => {
  const t = useTranslations()

  const conditionLabel = useMemo(() => {
    switch (conditionType) {
      case triggerEventTypes.enum.tagApplied:
        return t("trigger.conditions.tagApplied")
      case triggerEventTypes.enum.tagRemoved:
        return t("trigger.conditions.tagRemoved")
      case triggerEventTypes.enum.customFieldValueChanged:
        return t("trigger.conditions.customFieldValueChanged")
      case triggerEventTypes.enum.dateTimeBasedTrigger:
        return t("trigger.conditions.dateTimeBasedTrigger")
      case triggerEventTypes.enum.conversationTransferredToHuman:
        return t("trigger.conditions.conversationTransferredToHuman")
      case triggerEventTypes.enum.conversationTransferredToBot:
        return t("trigger.conditions.conversationTransferredToBot")
      case triggerEventTypes.enum.newContact:
        return t("trigger.conditions.newContact")
      case triggerEventTypes.enum.contactUnsubscribedFormBroadcast:
        return t("trigger.conditions.contactUnsubscribedFormBroadcast")
      case triggerEventTypes.enum.archived:
        return t("trigger.conditions.archived")
      case triggerEventTypes.enum.followUp:
        return t("trigger.conditions.followUp")
      case triggerEventTypes.enum.conversationAssigned:
        return t("trigger.conditions.conversationAssigned")
      case triggerEventTypes.enum.conversationUnassigned:
        return t("trigger.conditions.conversationUnassigned")
      case triggerEventTypes.enum.incomingCall:
        return t("trigger.conditions.incomingCall")
      case triggerEventTypes.enum.missedAudioCall:
        return t("trigger.conditions.missedAudioCall")
      case triggerEventTypes.enum.callEnded:
        return t("trigger.conditions.callEnded")
      case triggerEventTypes.enum.ticketCreated:
        return t("trigger.conditions.ticketCreated")
      case triggerEventTypes.enum.ticketMovedToStage:
        return t("trigger.conditions.ticketMovedToStage")
      case triggerEventTypes.enum.ticketValueChanged:
        return t("trigger.conditions.ticketValueChanged")
      case triggerEventTypes.enum.ticketStatusChanged:
        return t("trigger.conditions.ticketStatusChanged")
      case triggerEventTypes.enum.ticketPriorityChanged:
        return t("trigger.conditions.ticketPriorityChanged")
      case triggerEventTypes.enum.subscribedToSequence:
        return t("trigger.conditions.subscribedToSequence")
      case triggerEventTypes.enum.unsubscribedFromSequence:
        return t("trigger.conditions.unsubscribedFromSequence")
      case triggerEventTypes.enum.WhatsappShoppingCartSent:
        return t("trigger.conditions.WhatsappShoppingCartSent")
      case triggerEventTypes.enum.userAskedAboutProduct:
        return t("trigger.conditions.userAskedAboutProduct")
      case triggerEventTypes.enum.cartAbandoned:
        return t("trigger.conditions.cartAbandoned")
      case triggerEventTypes.enum.newOrder:
        return t("trigger.conditions.newOrder")
      case triggerEventTypes.enum.orderAccepted:
        return t("trigger.conditions.orderAccepted")
      case triggerEventTypes.enum.orderShipped:
        return t("trigger.conditions.orderShipped")
      case triggerEventTypes.enum.orderConcluded:
        return t("trigger.conditions.orderConcluded")
      case triggerEventTypes.enum.orderCancelled:
        return t("trigger.conditions.orderCancelled")
      case triggerEventTypes.enum.categoryAddedToCart:
        return t("trigger.conditions.categoryAddedToCart")
      case triggerEventTypes.enum.productAddedToCart:
        return t("trigger.conditions.productAddedToCart")
      case triggerEventTypes.enum.productRemovedFromCart:
        return t("trigger.conditions.productRemovedFromCart")
      case triggerEventTypes.enum.productOrdered:
        return t("trigger.conditions.productOrdered")
      case triggerEventTypes.enum.contactReferredANewContact:
        return t("trigger.conditions.contactReferredANewContact")
      case triggerEventTypes.enum.contactReferredExistingContact:
        return t("trigger.conditions.contactReferredExistingContact")
      default:
        break
    }
  }, [conditionType, t])

  const actionLabel = useMemo(() => {
    switch (actionType) {
      case triggerActions.enum.addTag:
        return t("trigger.actions.addTag")
      case triggerActions.enum.removeTag:
        return t("trigger.actions.removeTag")
      case triggerActions.enum.setCustomField:
        return t("trigger.actions.setCustomField")
      case triggerActions.enum.clearCustomField:
        return t("trigger.actions.clearCustomField")
      case triggerActions.enum.startAnotherFlow:
        return t("trigger.actions.startAnotherFlow")
      case triggerActions.enum.transferConversationToHuman:
        return t("trigger.actions.transferConversationToHuman")
      case triggerActions.enum.runGoogleSheet:
        return "Google Sheets"
      default:
        break
    }
  }, [actionType, t])

  const label = conditionLabel || actionLabel
  return (
    <Card className="group relative">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <Button
          className="absolute top-0 right-0 hidden hover:bg-red hover:text-destructive group-hover:block"
          onClick={onRemove}
          type="button"
          variant="ghost"
        >
          <XIcon />
        </Button>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
