ALTER TABLE "Conversation" ADD COLUMN "inboxType" "InboxType" DEFAULT 'webchat'::"InboxType" NOT NULL;--> statement-breakpoint
ALTER TABLE "Message" ALTER COLUMN "messageType" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "MessageType";--> statement-breakpoint
CREATE TYPE "MessageType" AS ENUM('incoming', 'outgoing', 'activity');--> statement-breakpoint
ALTER TABLE "Message" ALTER COLUMN "messageType" SET DATA TYPE "MessageType" USING "messageType"::"MessageType";--> statement-breakpoint
ALTER TABLE "Conversation" DROP COLUMN "currentFlowRunId";--> statement-breakpoint
ALTER TABLE "Verification" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Verification" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Conversation" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Conversation" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Conversation" ALTER COLUMN "lastActivityAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Session" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Session" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "OrganizationMember" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "OrganizationMember" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "InboxTeam" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "InboxTeam" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "InboxTeamMember" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "InboxTeamMember" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ActivityLog" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ActivityLog" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Log" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Log" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Contact" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Contact" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Folder" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Folder" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Folder" ALTER COLUMN "paths" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Folder" ALTER COLUMN "paths" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Tag" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Tag" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Field" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Field" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ConversationParticipant" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ConversationParticipant" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Message" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Message" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Attachment" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Attachment" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AIAgent" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AIAgent" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AIAgent" ALTER COLUMN "messages" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "AIAgent" ALTER COLUMN "messages" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "AIAgent" ALTER COLUMN "tools" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "AIAgent" ALTER COLUMN "tools" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "AIAgent" ALTER COLUMN "models" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "AIAgent" ALTER COLUMN "models" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Organization" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Organization" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ChatbotMember" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ChatbotMember" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AIAssistant" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AIAssistant" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AIAssistant" ALTER COLUMN "aiTriggerIds" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "AIAssistant" ALTER COLUMN "aiTriggerIds" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "AIAssistant" ALTER COLUMN "attachmentIds" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "AIAssistant" ALTER COLUMN "attachmentIds" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "AITrigger" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AITrigger" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AITrigger" ALTER COLUMN "questions" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "AITrigger" ALTER COLUMN "questions" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationOpenAI" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "IntegrationOpenAI" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AIFile" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AIFile" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Flow" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Flow" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AIFunction" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AIFunction" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AIMCPServer" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AIMCPServer" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AIMCPServer" ALTER COLUMN "selectedTools" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "AIMCPServer" ALTER COLUMN "selectedTools" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationGoogleSheets" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "IntegrationGoogleSheets" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "IntegrationZalo" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "IntegrationZalo" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "WhatsappMessageTemplate" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "WhatsappMessageTemplate" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "WhatsappFlow" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "WhatsappFlow" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "IntegrationWebchat" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "IntegrationWebchat" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "IntegrationWebchat" ALTER COLUMN "authorizedDomains" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "IntegrationWebchat" ALTER COLUMN "authorizedDomains" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWebchat" ALTER COLUMN "conversationStarters" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "IntegrationWebchat" ALTER COLUMN "conversationStarters" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "IntegrationWebchat" ALTER COLUMN "persistentMenus" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "IntegrationWebchat" ALTER COLUMN "persistentMenus" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "FlowVersion" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "FlowVersion" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "FlowRun" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "FlowRun" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AutomatedResponse" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AutomatedResponse" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AutomatedResponse" ALTER COLUMN "userMessages" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "AutomatedResponse" ALTER COLUMN "userMessages" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "AutomatedResponse" ALTER COLUMN "replies" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "AutomatedResponse" ALTER COLUMN "replies" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ContactNote" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ContactNote" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ContactCustomField" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ContactCustomField" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Spreadsheet" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Spreadsheet" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Broadcast" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Broadcast" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "IntegrationGemini" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "IntegrationGemini" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Chatbot" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Chatbot" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ChatbotUsage" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ChatbotUsage" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Inbox" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Inbox" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Integration" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Integration" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AIEmbedding" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AIEmbedding" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AIEmbedding" ALTER COLUMN "embedding" SET DATA TYPE vector(1536) USING "embedding"::vector(1536);--> statement-breakpoint
ALTER TABLE "Invitation" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Invitation" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ContactInbox" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ContactInbox" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
DROP TYPE "AssignedType";