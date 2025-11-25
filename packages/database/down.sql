-- CreateEnum
CREATE TYPE "MessengerTag" AS ENUM ('CONFIRMED_EVENT_UPDATE', 'POST_PURCHASE_UPDATE', 'ACCOUNT_UPDATE', 'HUMAN_AGENT', 'CUSTOMER_FEEDBACK');

-- CreateEnum
CREATE TYPE "ConditionField" AS ENUM ('language', 'fullName', 'country', 'continent', 'gender', 'subscribedToBroadcast', 'contactCreatedDate', 'contactCreatedDateMinutesAgo', 'source', 'conversationTransferredToHuman', 'interactedInLast24H', 'existingContact', 'isGuestUser', 'currentChannel', 'timezone', 'hasOpportunity', 'hasOpenOpportunity', 'hasWonOpportunity', 'hasLostOpportunity', 'followsBusinessOnInstagram', 'businessFollowsUserOnInstagram', 'verifiedAccountOnInstagram', 'followerCountOnInstagram', 'lastSent', 'lastDelivered', 'lastSeen', 'lastSeenMinutesAgo', 'lastInteraction', 'lastInteractionMinutesAgo', 'noAdminReply', 'tags', 'getDataFromJSON', 'messengerList', 'subscribedToDripCampaign', 'conversationAssigned', 'emptyPointsLinks', 'sentMessage', 'automatedResponseReceived', 'executedFlow', 'executedStep', 'questionnaireStarted', 'questionnaireInProgress', 'questionnaireFinished', 'votedOnThePoll', 'commentedOnThePost', 'phone', 'phoneWasVerified', 'optedInForSMS', 'broadcastSent', 'broadcastDelivered', 'broadcastSeen', 'broadcastClicked', 'broadcastFailed', 'email', 'emailWasVerified', 'optedInForEmail', 'emailSent', 'emailDelivered', 'emailOpened', 'emailClicked', 'bought', 'boughtTheItems', 'totalSpent', 'numberOfOrders', 'shoppingCartTotal', 'shoppingCartSubTotal', 'shoppingCartIsEmpty', 'shoppingCartContainsItems', 'lastUserInput', 'lastUserInputType');

-- CreateEnum
CREATE TYPE "ConditionFieldType" AS ENUM ('string', 'number', 'boolean', 'date', 'datetime', 'list', 'json');

-- CreateEnum
CREATE TYPE "ConditionOperator" AS ENUM ('is', 'isNot', 'hasAnyValue', 'hasNoValue', 'greaterThan', 'lessThan', 'greaterThanOrEqualTo', 'lessThanOrEqualTo', 'contains', 'doesNotContain', 'startsWith', 'endsWith', 'interval', 'notInterval');

-- AlterEnum
ALTER TYPE "BroadcastSubaction" ADD VALUE 'OTN';

-- AlterTable
ALTER TABLE "Broadcast" DROP COLUMN "conditions",
ADD COLUMN     "contactFilter" JSONB,
DROP COLUMN "subaction",
ADD COLUMN     "subaction" TEXT NOT NULL;

