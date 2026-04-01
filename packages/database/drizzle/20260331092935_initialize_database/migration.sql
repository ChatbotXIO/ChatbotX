CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TYPE "AIEmbeddingStatus" AS ENUM('pending', 'success', 'error', 'processing');--> statement-breakpoint
CREATE TYPE "AnalyticsStatus" AS ENUM('processing', 'ingested', 'failed');--> statement-breakpoint
CREATE TYPE "ConditionOwnerType" AS ENUM('trigger', 'webhook', 'broadcast');--> statement-breakpoint
CREATE TYPE "BroadcastSchedulesType" AS ENUM('now', 'future');--> statement-breakpoint
CREATE TYPE "BroadcastStatus" AS ENUM('scheduled', 'sent');--> statement-breakpoint
CREATE TYPE "chatbot_member_roles" AS ENUM('owner', 'agent');--> statement-breakpoint
CREATE TYPE "CustomFieldType" AS ENUM('shortText', 'number', 'date', 'datetime', 'boolean', 'longText');--> statement-breakpoint
CREATE TYPE "Gender" AS ENUM('male', 'female', 'unknown');--> statement-breakpoint
CREATE TYPE "ContentType" AS ENUM('text', 'location');--> statement-breakpoint
CREATE TYPE "FileType" AS ENUM('image', 'video', 'audio', 'gif', 'file');--> statement-breakpoint
CREATE TYPE "MessageType" AS ENUM('incoming', 'outgoing', 'activity');--> statement-breakpoint
CREATE TYPE "SenderType" AS ENUM('bot', 'contact', 'system', 'user', 'api');--> statement-breakpoint
CREATE TYPE "FolderType" AS ENUM('tag', 'flow', 'customField', 'automatedResponse', 'trigger', 'webhook', 'sequence');--> statement-breakpoint
CREATE TABLE "ai_agents" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"name" text NOT NULL,
	"prompt" text,
	"messages" jsonb[] NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"tools" text[] NOT NULL,
	"models" jsonb[] NOT NULL,
	"temperature" double precision NOT NULL,
	"max_output_tokens" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_assistants" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"model" text NOT NULL,
	"ai_trigger_ids" text[] NOT NULL,
	"attachment_ids" text[] NOT NULL,
	"temperature" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_embeddings" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"status" "AIEmbeddingStatus" DEFAULT 'pending'::"AIEmbeddingStatus" NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"ai_file_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_files" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"chatbot_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_functions" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"purpose" text,
	"data_collect" jsonb,
	"output_message" text,
	"trigger_flow_id" bigint,
	"chatbot_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_mcp_servers" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"auth" jsonb NOT NULL,
	"available_tools" jsonb NOT NULL,
	"selected_tools" text[] NOT NULL,
	"chatbot_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_triggers" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"flow_id" bigint,
	"questions" jsonb[] NOT NULL,
	"final_message" text
);
--> statement-breakpoint
CREATE TABLE "ai_triggers_to_integration_open_ais" (
	"ai_trigger_id" bigint,
	"integration_open_ai_id" bigint,
	CONSTRAINT "ai_triggers_to_integration_open_ais_pkey" PRIMARY KEY("ai_trigger_id","integration_open_ai_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_manifest_statuses" (
	"object_key" varchar(255) PRIMARY KEY,
	"status" "AnalyticsStatus" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ingested_at" timestamp,
	"last_error" text,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_contact_stats" (
	"inbox_id" bigint PRIMARY KEY,
	"total_contacts" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"access_token_expires_at" timestamp(6) with time zone,
	"refresh_token" text,
	"refresh_token_expires_at" timestamp(6) with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"user_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"expires_at" timestamp(6) with time zone NOT NULL,
	"organization_id" bigint NOT NULL,
	"chatbot_id" bigint,
	"invited_by" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jwks" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"expires_at" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp(6) with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_anonymous" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp(6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automated_responses" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"folder_id" bigint,
	"user_messages" text[] NOT NULL,
	"status" boolean NOT NULL,
	"text" text,
	"flow_id" bigint
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"flow_id" bigint,
	"integration_whatsapp_id" bigint,
	"template_id" bigint,
	"template_data" jsonb DEFAULT '"{}"' NOT NULL,
	"status" "BroadcastStatus" NOT NULL,
	"schedules_type" "BroadcastSchedulesType" NOT NULL,
	"schedules_at" timestamp(6) with time zone NOT NULL,
	"contact_filter" jsonb,
	"subaction" text DEFAULT 'BSOO' NOT NULL,
	"channel" text DEFAULT 'omnichannel' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts_on_broadcasts" (
	"broadcast_id" bigint,
	"contact_id" bigint,
	"sent" boolean DEFAULT false NOT NULL,
	"delivered" boolean DEFAULT false NOT NULL,
	"seen" boolean DEFAULT false NOT NULL,
	"clicked" boolean DEFAULT false NOT NULL,
	"failed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "contacts_on_broadcasts_pkey" PRIMARY KEY("broadcast_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "chatbot_members" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"role" "chatbot_member_roles" NOT NULL,
	"notification_channels" jsonb DEFAULT '{}' NOT NULL,
	"notification_types" jsonb DEFAULT '{}' NOT NULL,
	"permissions" jsonb DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbots" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"default_reply" text,
	"target_country" text,
	"default_language" text DEFAULT 'en' NOT NULL,
	"account_timezone" text NOT NULL,
	"brand_color" text DEFAULT '#016DFF' NOT NULL,
	"development_mode" boolean DEFAULT false NOT NULL,
	"logo" text,
	"organization_id" bigint NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"token" text
);
--> statement-breakpoint
CREATE TABLE "chatbot_usages" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"contacts_count" integer DEFAULT 0 NOT NULL,
	"max_contacts" integer DEFAULT 0 NOT NULL,
	"chatbot_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_fields" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"type" "CustomFieldType" NOT NULL,
	"value" text,
	"description" text,
	"folder_id" bigint,
	"chatbot_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_custom_fields" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"value" text NOT NULL,
	"contact_id" bigint NOT NULL,
	"custom_field_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_inboxes" (
	"contact_id" text,
	"inbox_id" text,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"chatbot_id" text NOT NULL,
	"source_id" text NOT NULL,
	CONSTRAINT "contact_inboxes_pkey" PRIMARY KEY("contact_id","inbox_id")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"avatar" text,
	"phone_number" text,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_opt_in" boolean DEFAULT false NOT NULL,
	"first_name" text,
	"last_name" text,
	"gender" "Gender" NOT NULL,
	"channel" text NOT NULL,
	"last_read_at" timestamp(6) with time zone,
	"source" text,
	"ref" text,
	"country" text,
	"state" text,
	"city" text,
	"location" jsonb,
	"locale" text,
	"timezone" text,
	"subscribed_at" timestamp(6) with time zone,
	"source_id" text,
	"blocked_at" timestamp(6) with time zone,
	"enable_broadcast" boolean DEFAULT false NOT NULL,
	"chatbot_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_notes" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"text" text NOT NULL,
	"contact_id" bigint NOT NULL,
	"created_by_id" bigint
);
--> statement-breakpoint
CREATE TABLE "custom_fields" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"type" "CustomFieldType" NOT NULL,
	"description" text,
	"folder_id" bigint,
	"show_in_inbox" boolean NOT NULL,
	"chatbot_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"conversation_id" bigint NOT NULL,
	"file_type" "FileType" NOT NULL,
	"message_id" bigint NOT NULL,
	"source_id" text,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"size" integer DEFAULT 0 NOT NULL,
	"thumbnail_path" text,
	"origin_path" text NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"live_chat_enabled" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp(6) with time zone,
	"channel" text DEFAULT 'webchat' NOT NULL,
	"source_id" text,
	"conversation_attributes" jsonb,
	"contact_last_read_at" timestamp(6) with time zone,
	"agent_last_read_at" timestamp(6) with time zone,
	"last_activity_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"followed" boolean DEFAULT false NOT NULL,
	"assigned_user_id" bigint,
	"assigned_inbox_team_id" bigint,
	"chatbot_id" bigint NOT NULL,
	"contact_id" bigint NOT NULL,
	"inbox_id" bigint NOT NULL,
	"admin_replied_at" timestamp(6) with time zone,
	"contact_replied_at" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"conversation_id" bigint NOT NULL,
	"user_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"conversation_id" bigint NOT NULL,
	"inbox_id" bigint NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"text" text,
	"content_attributes" jsonb,
	"message_type" "MessageType" NOT NULL,
	"content_type" "ContentType" NOT NULL,
	"sender_type" "SenderType" NOT NULL,
	"sender_id" bigint,
	"source_id" text
);
--> statement-breakpoint
CREATE TABLE "saved_replies" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"shortcut" text NOT NULL,
	"text" text NOT NULL,
	"user_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AuditLog" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"detail" text NOT NULL,
	"chatbotId" bigint NOT NULL,
	"userId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Plan" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"priceId" text NOT NULL,
	"annualDiscountPrice" integer,
	"annualDiscountPriceId" text,
	"limits" jsonb NOT NULL,
	"freeTrial" jsonb,
	"currency" text NOT NULL,
	"marketingFeatures" text[] DEFAULT '{}'::text[] NOT NULL,
	"organizationId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Subscription" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"plan" text NOT NULL,
	"referenceId" text NOT NULL,
	"stripeCustomerId" text,
	"stripeSubscriptionId" text,
	"status" text NOT NULL,
	"periodStart" timestamp(6) with time zone,
	"periodEnd" timestamp(6) with time zone,
	"cancelAtPeriodEnd" boolean,
	"cancelAt" timestamp(6) with time zone,
	"canceledAt" timestamp(6) with time zone,
	"endedAt" timestamp(6) with time zone,
	"seats" integer,
	"trialStart" timestamp(6) with time zone,
	"trialEnd" timestamp(6) with time zone,
	"billingInterval" text,
	"stripeScheduleId" text
);
--> statement-breakpoint
CREATE TABLE "error_logs" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"detail" text NOT NULL,
	"http_code" text,
	"chatbot_id" bigint NOT NULL,
	"contact_id" bigint
);
--> statement-breakpoint
CREATE TABLE "flows" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"enable_in_inbox" boolean DEFAULT true NOT NULL,
	"current_version_id" bigint,
	"draft_version_id" text,
	"chatbot_id" bigint NOT NULL,
	"folder_id" bigint
);
--> statement-breakpoint
CREATE TABLE "flow_runs" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"flow_id" bigint NOT NULL,
	"flow_version_id" bigint NOT NULL,
	"conversation_id" bigint
);
--> statement-breakpoint
CREATE TABLE "flow_versions" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"flow_id" bigint NOT NULL,
	"nodes" jsonb NOT NULL,
	"edges" jsonb NOT NULL,
	"is_draft" boolean NOT NULL,
	"is_latest" boolean DEFAULT false NOT NULL,
	"start_node_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"folder_type" "FolderType" NOT NULL,
	"parent_id" bigint,
	"chatbot_id" bigint NOT NULL,
	"is_trash" boolean DEFAULT false NOT NULL,
	"paths" bigint[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inboxes" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"channel" text NOT NULL,
	"source_id" text NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_team_members" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"inbox_team_id" bigint NOT NULL,
	"user_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_teams" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"integration_type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_geminis" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"auto_reply" boolean DEFAULT false NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"integration_id" bigint NOT NULL,
	"max_output_tokens" integer NOT NULL,
	"model" text NOT NULL,
	"prompt" text,
	"temperature" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_google_sheets" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"integration_id" bigint NOT NULL,
	"auth" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spreadsheets" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"spreadsheet_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_messengers" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"page_id" text NOT NULL,
	"name" text NOT NULL,
	"conversation_starters" jsonb NOT NULL,
	"persistent_menus" jsonb NOT NULL,
	"greeting_messages" jsonb NOT NULL,
	"personas" jsonb NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"inbox_id" bigint NOT NULL,
	"welcome_flow_id" bigint
);
--> statement-breakpoint
CREATE TABLE "integration_open_ais" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"auto_reply" boolean DEFAULT true NOT NULL,
	"auto_reply_voice" boolean DEFAULT false NOT NULL,
	"voice" text,
	"prompt" text,
	"model" text NOT NULL,
	"temperature" double precision NOT NULL,
	"max_output_tokens" integer NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"integration_id" bigint NOT NULL,
	"ai_assistant_id" bigint,
	"ai_agent_id" bigint
);
--> statement-breakpoint
CREATE TABLE "integration_webchats" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"name" text NOT NULL,
	"enable" boolean DEFAULT true NOT NULL,
	"authorized_domains" text[] NOT NULL,
	"conversation_starters" jsonb[] NOT NULL,
	"persistent_menus" jsonb[] NOT NULL,
	"brand_color" text DEFAULT '#007bff' NOT NULL,
	"hide_header" boolean DEFAULT false NOT NULL,
	"show_logo" boolean DEFAULT false NOT NULL,
	"hide_message_input" boolean DEFAULT false NOT NULL,
	"custom_css" text,
	"chatbot_id" bigint NOT NULL,
	"inbox_id" bigint NOT NULL,
	"welcome_flow_id" bigint
);
--> statement-breakpoint
CREATE TABLE "integration_whatsapps" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"phone_number_id" text NOT NULL,
	"waba_id" text NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"inbox_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_flows" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"integration_whatsapp_id" bigint NOT NULL,
	"source_id" text NOT NULL,
	"status" text NOT NULL,
	"is_completed" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_message_templates" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"integration_whatsapp_id" bigint NOT NULL,
	"source_id" text NOT NULL,
	"language" text NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"components" jsonb DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_zalos" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"oa_id" text NOT NULL,
	"name" text NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"inbox_id" bigint NOT NULL,
	"fallback_flow_id" bigint
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"role" text NOT NULL,
	"organization_id" bigint NOT NULL,
	"user_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"metadata" text,
	"domain" text,
	"support_email" text,
	"settings" jsonb DEFAULT '{}' NOT NULL,
	"default_max_contacts" integer DEFAULT 999999999 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reflinks" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"flow_id" bigint NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"custom_field_id" bigint
);
--> statement-breakpoint
CREATE TABLE "contacts_on_sequences" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"enrolled_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp(6) with time zone,
	"current_step" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"next_run_at" timestamp(6) with time zone,
	"last_step_id" bigint,
	"next_step_id" bigint,
	"locked_at" timestamp(6) with time zone,
	"lock_owner" text,
	"error_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"contact_id" bigint NOT NULL,
	"sequence_id" bigint NOT NULL,
	"chatbot_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_dispatches" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"run_at_ms" bigint DEFAULT 0 NOT NULL,
	"bucket" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"locked_at" timestamp(6) with time zone,
	"lock_owner" text,
	"completed_at" timestamp(6) with time zone,
	"chatbot_id" bigint NOT NULL,
	"sequence_id" bigint NOT NULL,
	"contact_id" bigint NOT NULL,
	"step_id" bigint NOT NULL,
	"enrollment_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_events" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"occurred_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"chatbot_id" bigint NOT NULL,
	"sequence_id" bigint NOT NULL,
	"contact_id" bigint NOT NULL,
	"step_id" bigint NOT NULL,
	"dispatch_id" bigint
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"folder_id" bigint,
	"active" boolean DEFAULT true NOT NULL,
	"subscribers" integer DEFAULT 0 NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"open_rate" double precision DEFAULT 0 NOT NULL,
	"ctr" double precision DEFAULT 0 NOT NULL,
	"chatbot_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_steps" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"order" integer NOT NULL,
	"delay_days" integer NOT NULL,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"delay_unit" text DEFAULT 'days',
	"specific_date_time" timestamp(6) with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"anytime" boolean DEFAULT true NOT NULL,
	"send_time_start" text,
	"send_time_end" text,
	"send_days" text DEFAULT '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]',
	"flow_id" bigint,
	"sequence_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts_to_tags" (
	"contact_id" bigint,
	"tag_id" bigint,
	CONSTRAINT "contacts_to_tags_pkey" PRIMARY KEY("contact_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"folder_id" bigint,
	"sync_to_messenger" boolean DEFAULT false NOT NULL,
	"chatbot_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conditions" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"trigger_id" bigint,
	"webhook_id" bigint,
	"type" integer NOT NULL,
	"source_id" text,
	"operator" varchar(255),
	"value" jsonb
);
--> statement-breakpoint
CREATE TABLE "trigger_contact_histories" (
	"id" bigint,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"trigger_id" bigint NOT NULL,
	"contact_id" bigint,
	"chatbot_id" bigint NOT NULL,
	"first_entered_at" timestamp(6) with time zone NOT NULL,
	CONSTRAINT "trigger_contact_histories_pkey" PRIMARY KEY("id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "trigger_executions" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"trigger_id" bigint NOT NULL,
	"contact_id" bigint NOT NULL,
	"chatbot_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "triggers" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"folder_id" bigint,
	"actions" jsonb DEFAULT '[]' NOT NULL,
	"chatbot_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trigger_stats" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"trigger_id" bigint NOT NULL,
	"chatbot_id" bigint NOT NULL,
	"date" timestamp(6) with time zone NOT NULL,
	"total_contacts" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"total_executions" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" bigint PRIMARY KEY,
	"created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"folder_id" bigint,
	"url" text NOT NULL,
	"chatbot_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "AIEmbedding_chatbotId_idx" ON "ai_embeddings" ("chatbot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_code_key" ON "invitations" ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions" ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");--> statement-breakpoint
CREATE INDEX "automated_responses_chatbot_id_idx" ON "automated_responses" ("chatbot_id");--> statement-breakpoint
CREATE INDEX "broadcasts_chatbot_id_idx" ON "broadcasts" ("chatbot_id");--> statement-breakpoint
CREATE INDEX "broadcasts_flow_id_idx" ON "broadcasts" ("flow_id");--> statement-breakpoint
CREATE INDEX "broadcasts_channel_idx" ON "broadcasts" ("channel");--> statement-breakpoint
CREATE INDEX "broadcasts_schedules_at_idx" ON "broadcasts" ("schedules_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ChatbotUsage_chatbotId_key" ON "chatbot_usages" ("chatbot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bot_fields_chatbot_id_field_type_name_key" ON "bot_fields" ("chatbot_id","type","name");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_custom_fields_contact_id_custom_field_id_key" ON "contact_custom_fields" ("contact_id","custom_field_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_chatbot_id_source_id_key" ON "contacts" ("chatbot_id","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_fields_chatbot_id_field_type_name_key" ON "custom_fields" ("chatbot_id","type","name");--> statement-breakpoint
CREATE INDEX "attachments_chatbot_id_idx" ON "attachments" ("chatbot_id");--> statement-breakpoint
CREATE INDEX "attachments_message_id_idx" ON "attachments" ("message_id");--> statement-breakpoint
CREATE INDEX "conversations_chatbot_id_source_id_idx" ON "conversations" ("chatbot_id","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_contact_id_key" ON "conversations" ("contact_id");--> statement-breakpoint
CREATE INDEX "conversation_participants_chatbot_id_idx" ON "conversation_participants" ("chatbot_id");--> statement-breakpoint
CREATE INDEX "conversation_participants_conversation_id_idx" ON "conversation_participants" ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_participants_conversation_id_user_id_key" ON "conversation_participants" ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "messages_chatbot_id_idx" ON "messages" ("chatbot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_chatbot_id_source_id_key" ON "messages" ("chatbot_id","source_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_inbox_id_idx" ON "messages" ("inbox_id");--> statement-breakpoint
CREATE INDEX "messages_sender_type_sender_id_idx" ON "messages" ("sender_type","sender_id");--> statement-breakpoint
CREATE INDEX "folders_chatbot_id_idx" ON "folders" ("chatbot_id");--> statement-breakpoint
CREATE INDEX "folders_parent_id_idx" ON "folders" ("parent_id");--> statement-breakpoint
CREATE INDEX "inboxes_chatbot_id_idx" ON "inboxes" ("chatbot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inboxes_chatbot_id_channel_source_id_key" ON "inboxes" ("channel","source_id");--> statement-breakpoint
CREATE INDEX "integrations_chatbot_id_idx" ON "integrations" ("chatbot_id");--> statement-breakpoint
CREATE INDEX "integrations_chatbot_id_integration_type_key" ON "integrations" ("chatbot_id","integration_type");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_geminis_chatbot_id_key" ON "integration_geminis" ("chatbot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_geminis_integration_id_key" ON "integration_geminis" ("integration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_google_sheets_integration_id_key" ON "integration_google_sheets" ("integration_id");--> statement-breakpoint
CREATE INDEX "spreadsheets_chatbot_id_idx" ON "spreadsheets" ("chatbot_id");--> statement-breakpoint
CREATE INDEX "spreadsheets_chatbot_id_spreadsheet_id_idx" ON "spreadsheets" ("chatbot_id","spreadsheet_id");--> statement-breakpoint
CREATE INDEX "spreadsheets_spreadsheet_id_idx" ON "spreadsheets" ("spreadsheet_id");--> statement-breakpoint
CREATE INDEX "integration_messengers_chatbot_id_idx" ON "integration_messengers" ("chatbot_id");--> statement-breakpoint
CREATE INDEX "integration_messengers_welcome_flow_id_idx" ON "integration_messengers" ("welcome_flow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_messengers_inbox_id_key" ON "integration_messengers" ("inbox_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_messengers_page_id_key" ON "integration_messengers" ("page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_open_ais_integration_id_key" ON "integration_open_ais" ("integration_id");--> statement-breakpoint
CREATE INDEX "integration_webchats_chatbot_id_idx" ON "integration_webchats" ("chatbot_id");--> statement-breakpoint
CREATE INDEX "integration_webchats_inbox_id_idx" ON "integration_webchats" ("inbox_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_webchats_inbox_id_key" ON "integration_webchats" ("inbox_id");--> statement-breakpoint
CREATE INDEX "integration_webchats_welcome_flow_id_idx" ON "integration_webchats" ("welcome_flow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_whatsapps_inbox_id_key" ON "integration_whatsapps" ("inbox_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_message_templates_integration_whatsapp_id_source_id_key" ON "whatsapp_message_templates" ("integration_whatsapp_id","source_id");--> statement-breakpoint
CREATE INDEX "integration_zalos_chatbot_id_idx" ON "integration_zalos" ("chatbot_id");--> statement-breakpoint
CREATE INDEX "integration_zalos_fallback_flow_id_idx" ON "integration_zalos" ("fallback_flow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_zalos_inbox_id_key" ON "integration_zalos" ("inbox_id");--> statement-breakpoint
CREATE INDEX "organizations_domain_idx" ON "organizations" ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations" ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "reflinks_chatbot_id_name_key" ON "reflinks" ("chatbot_id","name");--> statement-breakpoint
CREATE INDEX "contacts_on_sequences_sequence_id_idx" ON "contacts_on_sequences" ("sequence_id");--> statement-breakpoint
CREATE INDEX "contacts_on_sequences_contact_id_idx" ON "contacts_on_sequences" ("contact_id");--> statement-breakpoint
CREATE INDEX "contacts_on_sequences_chatbot_id_idx" ON "contacts_on_sequences" ("chatbot_id");--> statement-breakpoint
CREATE INDEX "contacts_on_sequences_status_next_run_at_idx" ON "contacts_on_sequences" ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "contacts_on_sequences_chatbot_id_status_next_run_at_idx" ON "contacts_on_sequences" ("chatbot_id","status","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_on_sequences_contact_id_sequence_id_chatbot_id_key" ON "contacts_on_sequences" ("contact_id","sequence_id","chatbot_id");--> statement-breakpoint
CREATE INDEX "SequenceDispatch_status_runAtMs_idx" ON "sequence_dispatches" ("status","run_at_ms");--> statement-breakpoint
CREATE INDEX "SequenceDispatch_chatbotId_status_runAtMs_idx" ON "sequence_dispatches" ("chatbot_id","status","run_at_ms");--> statement-breakpoint
CREATE UNIQUE INDEX "SequenceDispatch_idempotencyKey_key" ON "sequence_dispatches" ("idempotency_key","chatbot_id");--> statement-breakpoint
CREATE INDEX "SequenceDispatch_enrollmentId_idx" ON "sequence_dispatches" ("enrollment_id");--> statement-breakpoint
CREATE INDEX "SequenceDispatch_bucket_status_runAtMs_idx" ON "sequence_dispatches" ("bucket","status","run_at_ms");--> statement-breakpoint
CREATE INDEX "sequence_events_chatbot_id_occurred_at_idx" ON "sequence_events" ("chatbot_id","occurred_at");--> statement-breakpoint
CREATE INDEX "sequence_events_contact_id_occurred_at_idx" ON "sequence_events" ("contact_id","occurred_at");--> statement-breakpoint
CREATE INDEX "sequence_events_sequence_id_event_type_idx" ON "sequence_events" ("sequence_id","event_type");--> statement-breakpoint
CREATE INDEX "sequence_folder_id_idx" ON "sequences" ("folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sequence_chatbot_id_name_key" ON "sequences" ("chatbot_id","name");--> statement-breakpoint
CREATE INDEX "sequence_steps_sequence_id_idx" ON "sequence_steps" ("sequence_id");--> statement-breakpoint
CREATE INDEX "sequence_steps_flow_id_idx" ON "sequence_steps" ("flow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_chatbot_id_name_key" ON "tags" ("chatbot_id","name");--> statement-breakpoint
CREATE INDEX "tags_folder_id_idx" ON "tags" ("folder_id");--> statement-breakpoint
CREATE INDEX "conditions_type_source_id_idx" ON "conditions" ("type","source_id");--> statement-breakpoint
CREATE INDEX "conditions_trigger_id_idx" ON "conditions" ("trigger_id");--> statement-breakpoint
CREATE INDEX "conditions_webhook_id_idx" ON "conditions" ("webhook_id");--> statement-breakpoint
CREATE INDEX "conditions_type_source_id_trigger_id_idx" ON "conditions" ("type","source_id","trigger_id");--> statement-breakpoint
CREATE INDEX "conditions_type_source_id_webhook_id_idx" ON "conditions" ("type","source_id","webhook_id");--> statement-breakpoint
CREATE INDEX "trigger_contact_histories_trigger_id_contact_id_idx" ON "trigger_contact_histories" ("trigger_id","contact_id");--> statement-breakpoint
CREATE INDEX "trigger_contact_histories_contact_id_idx" ON "trigger_contact_histories" ("contact_id");--> statement-breakpoint
CREATE INDEX "trigger_contact_histories_chatbot_id_idx" ON "trigger_contact_histories" ("chatbot_id");--> statement-breakpoint
CREATE INDEX "trigger_executions_trigger_id_contact_id_idx" ON "trigger_executions" ("trigger_id","contact_id");--> statement-breakpoint
CREATE INDEX "trigger_executions_chatbot_id_idx" ON "trigger_executions" ("chatbot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "triggers_chatbot_id_name_key" ON "triggers" ("chatbot_id","name");--> statement-breakpoint
CREATE INDEX "triggers_chatbot_id_idx" ON "triggers" ("chatbot_id");--> statement-breakpoint
CREATE INDEX "triggers_folder_id_idx" ON "triggers" ("folder_id");--> statement-breakpoint
CREATE INDEX "triggers_chatbot_id_active_idx" ON "triggers" ("chatbot_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "trigger_stats_trigger_id_date_key" ON "trigger_stats" ("trigger_id","date");--> statement-breakpoint
CREATE INDEX "trigger_stats_trigger_id_date_idx" ON "trigger_stats" ("trigger_id","date");--> statement-breakpoint
CREATE INDEX "trigger_stats_chatbot_id_date_idx" ON "trigger_stats" ("chatbot_id","date");--> statement-breakpoint
CREATE INDEX "webhooks_chatbot_id_idx" ON "webhooks" ("chatbot_id");--> statement-breakpoint
CREATE INDEX "webhooks_folder_id_idx" ON "webhooks" ("folder_id");--> statement-breakpoint
CREATE INDEX "webhooks_chatbot_id_active_idx" ON "webhooks" ("chatbot_id","active");--> statement-breakpoint
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_assistants" ADD CONSTRAINT "ai_assistants_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_embeddings" ADD CONSTRAINT "ai_embeddings_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_embeddings" ADD CONSTRAINT "ai_embeddings_ai_file_id_ai_files_id_fkey" FOREIGN KEY ("ai_file_id") REFERENCES "ai_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_files" ADD CONSTRAINT "ai_files_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_functions" ADD CONSTRAINT "ai_functions_trigger_flow_id_flows_id_fkey" FOREIGN KEY ("trigger_flow_id") REFERENCES "flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_functions" ADD CONSTRAINT "ai_functions_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_mcp_servers" ADD CONSTRAINT "ai_mcp_servers_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_triggers" ADD CONSTRAINT "ai_triggers_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_triggers_to_integration_open_ais" ADD CONSTRAINT "ai_triggers_to_integration_open_ais_hpLkKL9Mafq3_fkey" FOREIGN KEY ("ai_trigger_id") REFERENCES "ai_triggers"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_triggers_to_integration_open_ais" ADD CONSTRAINT "ai_triggers_to_integration_open_ais_JNq63C3X2mlr_fkey" FOREIGN KEY ("integration_open_ai_id") REFERENCES "integration_open_ais"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "inbox_contact_stats" ADD CONSTRAINT "inbox_contact_stats_inbox_id_inboxes_id_fkey" FOREIGN KEY ("inbox_id") REFERENCES "inboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "automated_responses" ADD CONSTRAINT "automated_responses_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "automated_responses" ADD CONSTRAINT "automated_responses_folder_id_folders_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "automated_responses" ADD CONSTRAINT "automated_responses_flow_id_flows_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_flow_id_flows_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_VMgBBwBibXIL_fkey" FOREIGN KEY ("integration_whatsapp_id") REFERENCES "integration_whatsapps"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contacts_on_broadcasts" ADD CONSTRAINT "contacts_on_broadcasts_broadcast_id_broadcasts_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contacts_on_broadcasts" ADD CONSTRAINT "contacts_on_broadcasts_contact_id_contacts_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "chatbot_members" ADD CONSTRAINT "chatbot_members_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "chatbot_members" ADD CONSTRAINT "chatbot_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "chatbots" ADD CONSTRAINT "chatbots_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "chatbot_usages" ADD CONSTRAINT "chatbot_usages_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "bot_fields" ADD CONSTRAINT "bot_fields_folder_id_folders_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "bot_fields" ADD CONSTRAINT "bot_fields_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contact_custom_fields" ADD CONSTRAINT "contact_custom_fields_contact_id_contacts_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contact_custom_fields" ADD CONSTRAINT "contact_custom_fields_custom_field_id_custom_fields_id_fkey" FOREIGN KEY ("custom_field_id") REFERENCES "custom_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_contact_id_contacts_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_created_by_id_users_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_folder_id_folders_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_messages_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_user_id_users_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_inbox_team_id_inbox_teams_id_fkey" FOREIGN KEY ("assigned_inbox_team_id") REFERENCES "inbox_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_inbox_id_inboxes_id_fkey" FOREIGN KEY ("inbox_id") REFERENCES "inboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_inbox_id_inboxes_id_fkey" FOREIGN KEY ("inbox_id") REFERENCES "inboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "saved_replies" ADD CONSTRAINT "saved_replies_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Plan" ADD CONSTRAINT "BillingPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "error_logs" ADD CONSTRAINT "error_logs_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "error_logs" ADD CONSTRAINT "error_logs_contact_id_contacts_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_folder_id_folders_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_flow_id_flows_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_flow_version_id_flow_versions_id_fkey" FOREIGN KEY ("flow_version_id") REFERENCES "flow_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "flow_versions" ADD CONSTRAINT "flow_versions_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "flow_versions" ADD CONSTRAINT "flow_versions_flow_id_flows_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "inboxes" ADD CONSTRAINT "inboxes_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "inbox_team_members" ADD CONSTRAINT "inbox_team_members_inbox_team_id_inbox_teams_id_fkey" FOREIGN KEY ("inbox_team_id") REFERENCES "inbox_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "inbox_team_members" ADD CONSTRAINT "inbox_team_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "inbox_teams" ADD CONSTRAINT "inbox_teams_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_geminis" ADD CONSTRAINT "integration_geminis_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_geminis" ADD CONSTRAINT "integration_geminis_integration_id_integrations_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_google_sheets" ADD CONSTRAINT "integration_google_sheets_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_google_sheets" ADD CONSTRAINT "integration_google_sheets_integration_id_integrations_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "spreadsheets" ADD CONSTRAINT "spreadsheets_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_messengers" ADD CONSTRAINT "integration_messengers_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_messengers" ADD CONSTRAINT "integration_messengers_inbox_id_inboxes_id_fkey" FOREIGN KEY ("inbox_id") REFERENCES "inboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_messengers" ADD CONSTRAINT "integration_messengers_welcome_flow_id_flows_id_fkey" FOREIGN KEY ("welcome_flow_id") REFERENCES "flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_open_ais" ADD CONSTRAINT "integration_open_ais_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_open_ais" ADD CONSTRAINT "integration_open_ais_integration_id_integrations_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_open_ais" ADD CONSTRAINT "integration_open_ais_ai_assistant_id_ai_assistants_id_fkey" FOREIGN KEY ("ai_assistant_id") REFERENCES "ai_assistants"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_open_ais" ADD CONSTRAINT "integration_open_ais_ai_agent_id_ai_agents_id_fkey" FOREIGN KEY ("ai_agent_id") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_webchats" ADD CONSTRAINT "integration_webchats_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_webchats" ADD CONSTRAINT "integration_webchats_inbox_id_inboxes_id_fkey" FOREIGN KEY ("inbox_id") REFERENCES "inboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_webchats" ADD CONSTRAINT "integration_webchats_welcome_flow_id_flows_id_fkey" FOREIGN KEY ("welcome_flow_id") REFERENCES "flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_whatsapps" ADD CONSTRAINT "integration_whatsapps_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_whatsapps" ADD CONSTRAINT "integration_whatsapps_inbox_id_inboxes_id_fkey" FOREIGN KEY ("inbox_id") REFERENCES "inboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_flows" ADD CONSTRAINT "whatsapp_flows_vWBhpBQwqVIL_fkey" FOREIGN KEY ("integration_whatsapp_id") REFERENCES "integration_whatsapps"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_message_templates" ADD CONSTRAINT "whatsapp_message_templates_5eIcarvpsXBF_fkey" FOREIGN KEY ("integration_whatsapp_id") REFERENCES "integration_whatsapps"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_zalos" ADD CONSTRAINT "integration_zalos_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_zalos" ADD CONSTRAINT "integration_zalos_inbox_id_inboxes_id_fkey" FOREIGN KEY ("inbox_id") REFERENCES "inboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "integration_zalos" ADD CONSTRAINT "integration_zalos_fallback_flow_id_flows_id_fkey" FOREIGN KEY ("fallback_flow_id") REFERENCES "flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "reflinks" ADD CONSTRAINT "reflinks_flow_id_flows_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "reflinks" ADD CONSTRAINT "reflinks_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "reflinks" ADD CONSTRAINT "reflinks_custom_field_id_custom_fields_id_fkey" FOREIGN KEY ("custom_field_id") REFERENCES "custom_fields"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contacts_on_sequences" ADD CONSTRAINT "contacts_on_sequences_contact_id_contacts_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contacts_on_sequences" ADD CONSTRAINT "contacts_on_sequences_sequence_id_sequences_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contacts_on_sequences" ADD CONSTRAINT "contacts_on_sequences_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "sequence_dispatches" ADD CONSTRAINT "sequence_dispatches_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "sequence_dispatches" ADD CONSTRAINT "sequence_dispatches_sequence_id_sequences_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "sequence_dispatches" ADD CONSTRAINT "sequence_dispatches_contact_id_contacts_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "sequence_dispatches" ADD CONSTRAINT "sequence_dispatches_step_id_sequence_steps_id_fkey" FOREIGN KEY ("step_id") REFERENCES "sequence_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "sequence_dispatches" ADD CONSTRAINT "sequence_dispatches_enrollment_id_contacts_on_sequences_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "contacts_on_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "sequence_events" ADD CONSTRAINT "sequence_events_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "sequence_events" ADD CONSTRAINT "sequence_events_sequence_id_sequences_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "sequence_events" ADD CONSTRAINT "sequence_events_contact_id_contacts_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "sequence_events" ADD CONSTRAINT "sequence_events_step_id_sequence_steps_id_fkey" FOREIGN KEY ("step_id") REFERENCES "sequence_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "sequence_events" ADD CONSTRAINT "sequence_events_dispatch_id_sequence_dispatches_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "sequence_dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_folder_id_folders_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_flow_id_flows_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_sequence_id_sequences_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contacts_to_tags" ADD CONSTRAINT "contacts_to_tags_contact_id_contacts_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contacts_to_tags" ADD CONSTRAINT "contacts_to_tags_tag_id_tags_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_folder_id_folders_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_trigger_id_triggers_id_fkey" FOREIGN KEY ("trigger_id") REFERENCES "triggers"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_webhook_id_webhooks_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trigger_contact_histories" ADD CONSTRAINT "trigger_contact_histories_trigger_id_triggers_id_fkey" FOREIGN KEY ("trigger_id") REFERENCES "triggers"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trigger_contact_histories" ADD CONSTRAINT "trigger_contact_histories_contact_id_contacts_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trigger_contact_histories" ADD CONSTRAINT "trigger_contact_histories_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trigger_executions" ADD CONSTRAINT "trigger_executions_trigger_id_triggers_id_fkey" FOREIGN KEY ("trigger_id") REFERENCES "triggers"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trigger_executions" ADD CONSTRAINT "trigger_executions_contact_id_contacts_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trigger_executions" ADD CONSTRAINT "trigger_executions_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_folder_id_folders_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trigger_stats" ADD CONSTRAINT "trigger_stats_trigger_id_triggers_id_fkey" FOREIGN KEY ("trigger_id") REFERENCES "triggers"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trigger_stats" ADD CONSTRAINT "trigger_stats_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_folder_id_folders_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_chatbot_id_chatbots_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
