import { Condition, TriggerAction } from "@aha.chat/database/enums"
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
  conditionType?: Condition
  actionType?: TriggerAction
  children: ReactNode
  onRemove: () => void
}) => {
  const t = useTranslations()

  const conditionLabel = useMemo(() => {
    switch (conditionType) {
      case Condition.tagApplied:
        return t("trigger.conditions.tagApplied")
      case Condition.tagRemoved:
        return t("trigger.conditions.tagRemoved")
      case Condition.customFieldValueChanged:
        return t("trigger.conditions.customFieldValueChanged")
      case Condition.dateTimeBasedTrigger:
        return t("trigger.conditions.dateTimeBasedTrigger")
      case Condition.conversationTransferredToHuman:
        return t("trigger.conditions.conversationTransferredToHuman")
      case Condition.conversationTransferredToBot:
        return t("trigger.conditions.conversationTransferredToBot")
      case Condition.newContact:
        return t("trigger.conditions.newContact")
      case Condition.contactUnsubscribedFormBroadcast:
        return t("trigger.conditions.contactUnsubscribedFormBroadcast")
      case Condition.archived:
        return t("trigger.conditions.archived")
      case Condition.followUp:
        return t("trigger.conditions.followUp")
      case Condition.conversationAssigned:
        return t("trigger.conditions.conversationAssigned")
      case Condition.conversationUnassigned:
        return t("trigger.conditions.conversationUnassigned")
      case Condition.incomingCall:
        return t("trigger.conditions.incomingCall")
      case Condition.missedAudioCall:
        return t("trigger.conditions.missedAudioCall")
      case Condition.callEnded:
        return t("trigger.conditions.callEnded")
      case Condition.ticketCreated:
        return t("trigger.conditions.ticketCreated")
      case Condition.ticketMovedToStage:
        return t("trigger.conditions.ticketMovedToStage")
      case Condition.ticketValueChanged:
        return t("trigger.conditions.ticketValueChanged")
      case Condition.ticketStatusChanged:
        return t("trigger.conditions.ticketStatusChanged")
      case Condition.ticketPriorityChanged:
        return t("trigger.conditions.ticketPriorityChanged")
      case Condition.subscribedToSequence:
        return t("trigger.conditions.subscribedToSequence")
      case Condition.unsubscribedFromSequence:
        return t("trigger.conditions.unsubscribedFromSequence")
      case Condition.WhatsappShoppingCartSent:
        return t("trigger.conditions.WhatsappShoppingCartSent")
      case Condition.userAskedAboutProduct:
        return t("trigger.conditions.userAskedAboutProduct")
      case Condition.cartAbandoned:
        return t("trigger.conditions.cartAbandoned")
      case Condition.newOrder:
        return t("trigger.conditions.newOrder")
      case Condition.orderAccepted:
        return t("trigger.conditions.orderAccepted")
      case Condition.orderShipped:
        return t("trigger.conditions.orderShipped")
      case Condition.orderConcluded:
        return t("trigger.conditions.orderConcluded")
      case Condition.orderCancelled:
        return t("trigger.conditions.orderCancelled")
      case Condition.categoryAddedToCart:
        return t("trigger.conditions.categoryAddedToCart")
      case Condition.productAddedToCart:
        return t("trigger.conditions.productAddedToCart")
      case Condition.productRemovedFromCart:
        return t("trigger.conditions.productRemovedFromCart")
      case Condition.productOrdered:
        return t("trigger.conditions.productOrdered")
      case Condition.contactReferredANewContact:
        return t("trigger.conditions.contactReferredANewContact")
      case Condition.contactReferredExistingContact:
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
