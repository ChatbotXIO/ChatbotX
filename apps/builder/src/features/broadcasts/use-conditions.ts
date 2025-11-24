"use client"

import {
  ConditionField,
  ConditionFieldType,
  ConditionOperator,
} from "@aha.chat/database/types"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

export const useConditions = ({
  searchField,
  searchOperator,
}: {
  searchField?: string
  searchOperator?: string
} = {}) => {
  const t = useTranslations()
  const originalFields = useMemo(
    () => [
      {
        groupName: "",
        children: [
          {
            field: ConditionField.language,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.language}`),
          },
          {
            field: ConditionField.fullName,
            type: ConditionFieldType.string,
            label: t(`condition.fields.${ConditionField.fullName}`),
          },
          {
            field: ConditionField.country,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.country}`),
          },
          {
            field: ConditionField.continent,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.continent}`),
          },
          {
            field: ConditionField.gender,
            type: ConditionFieldType.string,
            label: t(`condition.fields.${ConditionField.gender}`),
          },
          {
            field: ConditionField.subscribedToBroadcast,
            type: ConditionFieldType.boolean,
            label: t(
              `condition.fields.${ConditionField.subscribedToBroadcast}`,
            ),
          },
          {
            field: ConditionField.contactCreatedDate,
            type: ConditionFieldType.date,
            label: t(`condition.fields.${ConditionField.contactCreatedDate}`),
          },
          {
            field: ConditionField.contactCreatedDateMinutesAgo,
            type: ConditionFieldType.number,
            label: t(
              `condition.fields.${ConditionField.contactCreatedDateMinutesAgo}`,
            ),
          },
          {
            field: ConditionField.source,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.source}`),
          },
          {
            field: ConditionField.conversationTransferredToHuman,
            type: ConditionFieldType.boolean,
            label: t(
              `condition.fields.${ConditionField.conversationTransferredToHuman}`,
            ),
          },
          {
            field: ConditionField.interactedInLast24H,
            type: ConditionFieldType.boolean,
            label: t(`condition.fields.${ConditionField.interactedInLast24H}`),
          },
          {
            field: ConditionField.existingContact,
            type: ConditionFieldType.boolean,
            label: t(`condition.fields.${ConditionField.existingContact}`),
          },
          {
            field: ConditionField.isGuestUser,
            type: ConditionFieldType.boolean,
            label: t(`condition.fields.${ConditionField.isGuestUser}`),
          },
          {
            field: ConditionField.currentChannel,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.currentChannel}`),
          },
          {
            field: ConditionField.timezone,
            type: ConditionFieldType.number,
            label: t(`condition.fields.${ConditionField.timezone}`),
          },
        ],
      },
      {
        groupName: "",
        children: [
          {
            field: ConditionField.hasOpportunity,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.hasOpportunity}`),
          },
          {
            field: ConditionField.hasOpenOpportunity,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.hasOpenOpportunity}`),
          },
          {
            field: ConditionField.hasWonOpportunity,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.hasWonOpportunity}`),
          },
          {
            field: ConditionField.hasLostOpportunity,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.hasLostOpportunity}`),
          },
        ],
      },
      {
        groupName: t("condition.groups.instagram"),
        children: [
          {
            field: ConditionField.followsBusinessOnInstagram,
            type: ConditionFieldType.boolean,
            label: t(
              `condition.fields.${ConditionField.followsBusinessOnInstagram}`,
            ),
          },
          {
            field: ConditionField.businessFollowsUserOnInstagram,
            type: ConditionFieldType.boolean,
            label: t(
              `condition.fields.${ConditionField.businessFollowsUserOnInstagram}`,
            ),
          },
          {
            field: ConditionField.verifiedAccountOnInstagram,
            type: ConditionFieldType.boolean,
            label: t(
              `condition.fields.${ConditionField.verifiedAccountOnInstagram}`,
            ),
          },
          {
            field: ConditionField.followerCountOnInstagram,
            type: ConditionFieldType.number,
            label: t(
              `condition.fields.${ConditionField.followerCountOnInstagram}`,
            ),
          },
        ],
      },
      {
        groupName: t("condition.groups.analysis"),
        children: [
          {
            field: ConditionField.lastSent,
            type: ConditionFieldType.datetime,
            label: t(`condition.fields.${ConditionField.lastSent}`),
          },
          {
            field: ConditionField.lastDelivered,
            type: ConditionFieldType.datetime,
            label: t(`condition.fields.${ConditionField.lastDelivered}`),
          },
          {
            field: ConditionField.lastSeen,
            type: ConditionFieldType.datetime,
            label: t(`condition.fields.${ConditionField.lastSeen}`),
          },
          {
            field: ConditionField.lastSeenMinutesAgo,
            type: ConditionFieldType.number,
            label: t(`condition.fields.${ConditionField.lastSeenMinutesAgo}`),
          },
          {
            field: ConditionField.lastInteraction,
            type: ConditionFieldType.datetime,
            label: t(`condition.fields.${ConditionField.lastInteraction}`),
          },
          {
            field: ConditionField.lastInteractionMinutesAgo,
            type: ConditionFieldType.number,
            label: t(
              `condition.fields.${ConditionField.lastInteractionMinutesAgo}`,
            ),
          },
          {
            field: ConditionField.noAdminReply,
            type: ConditionFieldType.boolean,
            label: t(`condition.fields.${ConditionField.noAdminReply}`),
          },
          {
            field: ConditionField.tags,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.tags}`),
          },
          {
            field: ConditionField.getDataFromJSON,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.getDataFromJSON}`),
          },
          {
            field: ConditionField.messengerList,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.messengerList}`),
          },
          {
            field: ConditionField.subscribedToDripCampaign,
            type: ConditionFieldType.list,
            label: t(
              `condition.fields.${ConditionField.subscribedToDripCampaign}`,
            ),
          },
          {
            field: ConditionField.conversationAssigned,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.conversationAssigned}`),
          },
          {
            field: ConditionField.emptyPointsLinks,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.emptyPointsLinks}`),
          },
          {
            field: ConditionField.sentMessage,
            type: ConditionFieldType.string,
            label: t(`condition.fields.${ConditionField.sentMessage}`),
          },
          {
            field: ConditionField.automatedResponseReceived,
            type: ConditionFieldType.list,
            label: t(
              `condition.fields.${ConditionField.automatedResponseReceived}`,
            ),
          },
          {
            field: ConditionField.executedFlow,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.executedFlow}`),
          },
          {
            field: ConditionField.executedStep,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.executedStep}`),
          },
          {
            field: ConditionField.questionnaireStarted,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.questionnaireStarted}`),
          },
          {
            field: ConditionField.questionnaireInProgress,
            type: ConditionFieldType.list,
            label: t(
              `condition.fields.${ConditionField.questionnaireInProgress}`,
            ),
          },
          {
            field: ConditionField.questionnaireFinished,
            type: ConditionFieldType.list,
            label: t(
              `condition.fields.${ConditionField.questionnaireFinished}`,
            ),
          },
          {
            field: ConditionField.votedOnThePoll,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.votedOnThePoll}`),
          },
        ],
      },
      {
        groupName: t("condition.groups.facebookInstagramComment"),
        children: [
          {
            field: ConditionField.commentedOnThePost,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.commentedOnThePost}`),
          },
        ],
      },
      {
        groupName: t("condition.groups.sms"),
        children: [
          {
            field: ConditionField.phone,
            type: ConditionFieldType.string,
            label: t(`condition.fields.${ConditionField.phone}`),
          },
          {
            field: ConditionField.phoneWasVerified,
            type: ConditionFieldType.boolean,
            label: t(`condition.fields.${ConditionField.phoneWasVerified}`),
          },
          {
            field: ConditionField.optedInForSMS,
            type: ConditionFieldType.boolean,
            label: t(`condition.fields.${ConditionField.optedInForSMS}`),
          },
        ],
      },
      {
        groupName: t("condition.groups.broadcastWhatsApp"),
        children: [
          {
            field: ConditionField.broadcastSent,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.broadcastSent}`),
          },
          {
            field: ConditionField.broadcastDelivered,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.broadcastDelivered}`),
          },
          {
            field: ConditionField.broadcastSeen,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.broadcastSeen}`),
          },
          {
            field: ConditionField.broadcastClicked,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.broadcastClicked}`),
          },
          {
            field: ConditionField.broadcastFailed,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.broadcastFailed}`),
          },
        ],
      },
      {
        groupName: t("condition.groups.email"),
        children: [
          {
            field: ConditionField.email,
            type: ConditionFieldType.string,
            label: t(`condition.fields.${ConditionField.email}`),
          },
          {
            field: ConditionField.emailWasVerified,
            type: ConditionFieldType.boolean,
            label: t(`condition.fields.${ConditionField.emailWasVerified}`),
          },
          {
            field: ConditionField.optedInForEmail,
            type: ConditionFieldType.boolean,
            label: t(`condition.fields.${ConditionField.optedInForEmail}`),
          },
          {
            field: ConditionField.emailSent,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.emailSent}`),
          },
          {
            field: ConditionField.emailDelivered,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.emailDelivered}`),
          },
          {
            field: ConditionField.emailOpened,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.emailOpened}`),
          },
          {
            field: ConditionField.emailClicked,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.emailClicked}`),
          },
        ],
      },
      {
        groupName: t("condition.groups.ecommerce"),
        children: [
          {
            field: ConditionField.bought,
            type: ConditionFieldType.datetime,
            label: t(`condition.fields.${ConditionField.bought}`),
          },
          {
            field: ConditionField.boughtTheItems,
            type: ConditionFieldType.list,
            label: t(`condition.fields.${ConditionField.boughtTheItems}`),
          },
          {
            field: ConditionField.totalSpent,
            type: ConditionFieldType.number,
            label: t(`condition.fields.${ConditionField.totalSpent}`),
          },
          {
            field: ConditionField.numberOfOrders,
            type: ConditionFieldType.number,
            label: t(`condition.fields.${ConditionField.numberOfOrders}`),
          },
          {
            field: ConditionField.shoppingCartTotal,
            type: ConditionFieldType.number,
            label: t(`condition.fields.${ConditionField.shoppingCartTotal}`),
          },
          {
            field: ConditionField.shoppingCartSubTotal,
            type: ConditionFieldType.number,
            label: t(`condition.fields.${ConditionField.shoppingCartSubTotal}`),
          },
          {
            field: ConditionField.shoppingCartIsEmpty,
            type: ConditionFieldType.boolean,
            label: t(`condition.fields.${ConditionField.shoppingCartIsEmpty}`),
          },
          {
            field: ConditionField.shoppingCartContainsItems,
            type: ConditionFieldType.list,
            label: t(
              `condition.fields.${ConditionField.shoppingCartContainsItems}`,
            ),
          },
        ],
      },
      {
        groupName: t("condition.groups.customFields"),
        children: [],
      },
      {
        groupName: t("condition.groups.systemFields"),
        children: [
          {
            field: ConditionField.lastUserInput,
            type: ConditionFieldType.string,
            label: t(`condition.fields.${ConditionField.lastUserInput}`),
          },
          {
            field: ConditionField.lastUserInputType,
            type: ConditionFieldType.string,
            label: t(`condition.fields.${ConditionField.lastUserInputType}`),
          },
        ],
      },
    ],
    [t],
  )

  const filteredFieldList = useMemo(() => {
    if (searchField && searchField.length > 0) {
      return originalFields
        .map((group) => ({
          ...group,
          children: group.children.filter(
            (child) =>
              child.field.toLowerCase().includes(searchField.toLowerCase()) ||
              child.label.toLowerCase().includes(searchField.toLowerCase()),
          ),
        }))
        .filter((group) => group.children.length > 0)
    }
    return originalFields
  }, [originalFields, searchField])

  const operators: ConditionOperator[] = useMemo(
    () => [
      ConditionOperator.is,
      ConditionOperator.isNot,
      ConditionOperator.hasAnyValue,
      ConditionOperator.hasNoValue,
      ConditionOperator.greaterThan,
      ConditionOperator.lessThan,
      ConditionOperator.greaterThanOrEqualTo,
      ConditionOperator.lessThanOrEqualTo,
      ConditionOperator.contains,
      ConditionOperator.doesNotContain,
      ConditionOperator.startsWith,
      ConditionOperator.endsWith,
      ConditionOperator.interval,
      ConditionOperator.notInterval,
    ],
    [],
  )

  const filteredOperators = useMemo(() => {
    if (searchOperator && searchOperator.length > 0) {
      return operators.filter(
        (operator) =>
          operator.toLowerCase().includes(searchOperator.toLowerCase()) ||
          t(`condition.operators.${operator}`)
            .toLowerCase()
            .includes(searchOperator.toLowerCase()),
      )
    }
    return operators
  }, [operators, searchOperator, t])

  return { originalFields, filteredFieldList, operators, filteredOperators }
}
