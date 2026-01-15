import { TriggerAction, TriggerCondition } from "@aha.chat/database/enums"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type ReactNode, useMemo } from "react"

export const BaseEditor = ({
  conditionType,
  actionType,
  onRemove,
  children,
}: {
  conditionType?: TriggerCondition
  actionType?: TriggerAction
  children: ReactNode
  onRemove: () => void
}) => {
  const t = useTranslations()

  const conditionLabel = useMemo(() => {
    switch (conditionType) {
      case TriggerCondition.tagApplied:
        return t("trigger.conditions.tagApplied")
      case TriggerCondition.tagRemoved:
        return t("trigger.conditions.tagRemoved")
      case TriggerCondition.customFieldValueChanged:
        return t("trigger.conditions.customFieldValueChanged")
      case TriggerCondition.dateTimeBasedTrigger:
        return t("trigger.conditions.dateTimeBasedTrigger")
      case TriggerCondition.conversationTransferredToHuman:
        return t("trigger.conditions.conversationTransferredToHuman")
      case TriggerCondition.conversationTransferredToBot:
        return t("trigger.conditions.conversationTransferredToBot")
      case TriggerCondition.newContact:
        return t("trigger.conditions.newContact")
      case TriggerCondition.contactUnsubscribedFormBroadcast:
        return t("trigger.conditions.contactUnsubscribedFormBroadcast")
      case TriggerCondition.archived:
        return t("trigger.conditions.archived")
      case TriggerCondition.followUp:
        return t("trigger.conditions.followUp")
      case TriggerCondition.conversationAssigned:
        return t("trigger.conditions.conversationAssigned")
      case TriggerCondition.conversationUnassigned:
        return t("trigger.conditions.conversationUnassigned")
      case TriggerCondition.incomingCall:
        return t("trigger.conditions.incomingCall")
      case TriggerCondition.missedAudioCall:
        return t("trigger.conditions.missedAudioCall")
      case TriggerCondition.callEnded:
        return t("trigger.conditions.callEnded")
      case TriggerCondition.ticketCreated:
        return t("trigger.conditions.ticketCreated")
      case TriggerCondition.ticketMovedToStage:
        return t("trigger.conditions.ticketMovedToStage")
      case TriggerCondition.ticketValueChanged:
        return t("trigger.conditions.ticketValueChanged")
      case TriggerCondition.ticketStatusChanged:
        return t("trigger.conditions.ticketStatusChanged")
      case TriggerCondition.ticketPriorityChanged:
        return t("trigger.conditions.ticketPriorityChanged")
      case TriggerCondition.subscribedToSequence:
        return t("trigger.conditions.subscribedToSequence")
      case TriggerCondition.unsubscribedFromSequence:
        return t("trigger.conditions.unsubscribedFromSequence")
      case TriggerCondition.WhatsappShoppingCartSent:
        return t("trigger.conditions.WhatsappShoppingCartSent")
      case TriggerCondition.userAskedAboutProduct:
        return t("trigger.conditions.userAskedAboutProduct")
      case TriggerCondition.cartAbandoned:
        return t("trigger.conditions.cartAbandoned")
      case TriggerCondition.newOrder:
        return t("trigger.conditions.newOrder")
      case TriggerCondition.orderAccepted:
        return t("trigger.conditions.orderAccepted")
      case TriggerCondition.orderShipped:
        return t("trigger.conditions.orderShipped")
      case TriggerCondition.orderConcluded:
        return t("trigger.conditions.orderConcluded")
      case TriggerCondition.orderCancelled:
        return t("trigger.conditions.orderCancelled")
      case TriggerCondition.categoryAddedToCart:
        return t("trigger.conditions.categoryAddedToCart")
      case TriggerCondition.productAddedToCart:
        return t("trigger.conditions.productAddedToCart")
      case TriggerCondition.productRemovedFromCart:
        return t("trigger.conditions.productRemovedFromCart")
      case TriggerCondition.productOrdered:
        return t("trigger.conditions.productOrdered")
      case TriggerCondition.contactReferredANewContact:
        return t("trigger.conditions.contactReferredANewContact")
      case TriggerCondition.contactReferredExistingContact:
        return t("trigger.conditions.contactReferredExistingContact")
      default:
        break
    }
  }, [conditionType, t])

  const actionLabel = useMemo(() => {
    switch (actionType) {
      case TriggerAction.addTag:
        return t("trigger.actions.addTag")
      case TriggerAction.removeTag:
        return t("trigger.actions.removeTag")
      case TriggerAction.setCustomField:
        return t("trigger.actions.setCustomField")
      case TriggerAction.clearCustomField:
        return t("trigger.actions.clearCustomField")
      case TriggerAction.startAnotherFlow:
        return t("trigger.actions.startAnotherFlow")
      case TriggerAction.transferConversationToHuman:
        return t("trigger.actions.transferConversationToHuman")
      case TriggerAction.runGoogleSheet:
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
