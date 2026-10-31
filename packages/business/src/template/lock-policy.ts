import type { TemplateResourceKind } from "@chatbotx.io/database/partials"

/**
 * The content fields a template-installed copy locks against editing when its
 * `allowEdit` is false, per resource kind. Anything not listed is
 * installer-owned (toggles, folder moves, runtime values) and never blocked.
 * A kind absent here has no content lock yet (its category ships in a later
 * phase).
 */
export const TEMPLATE_LOCKED_CONTENT_KEYS: Readonly<
  Record<TemplateResourceKind, readonly string[]>
> = {
  flow: ["name", "nodes", "edges", "startNodeId", "currentVersionId"],
  aiAgent: [
    "name",
    "prompt",
    "actionPrompt",
    "actionRules",
    "messages",
    "models",
    "temperature",
    "maxOutputTokens",
    "tools",
    "isRichResponse",
    "webSearchAuthorizedDomains",
  ],
  aiFunction: [
    "name",
    "purpose",
    "dataCollect",
    "outputMessage",
    "triggerFlowId",
  ],
  calendar: [
    "name",
    "description",
    "timezone",
    "durationMinutes",
    "bufferAfterMinutes",
    "locationType",
    "locationDetail",
    "scheduleWindowType",
    "scheduleWindowConfig",
    "maxAppointmentsPerUser",
    "dailyLimitEnabled",
    "maxPerDay",
    "allowGroupMeeting",
    "maxPerSlot",
    "confirmationMessage",
    "confirmationFlowId",
    "cancellationFlowId",
    "externalEventTitleTemplate",
    "externalEventDescriptionTemplate",
    "externalEventAttendeesTemplate",
    "availability",
    "reminders",
  ],

  integrationWebchat: [
    "name",
    "conversationStarters",
    "persistentMenus",
    "brandColor",
    "hideHeader",
    "showLogo",
    "hideMessageInput",
    "customCss",
    "welcomeFlowId",
  ],
  automatedResponse: ["keywords", "text", "flowId"],
  // The widget settings (logo, brand name/URL, domains) are never shipped by
  // a template: they are the installer's, so none of them is locked.
  reflink: ["name", "flowId", "customFieldId", "qrStyles"],
  trigger: ["name", "actions", "conditions"],
  fbCommentAutomation: [
    "name",
    "post",
    "privateReply",
    "publicReply",
    "includeKeywords",
    "excludeKeywords",
    "excludeKeywordsType",
    "options",
    "hideComments",
    "replyAfter",
    "startTime",
    "endTime",
  ],
  product: [
    "name",
    "shortDescription",
    "longDescription",
    "price",
    "currency",
    "taxes",
    "discount",
    "images",
    "tags",
    "sku",
    "categoryId",
    "subcategoryId",
    "vendorId",
    "allowSpecialRequest",
    "isAddonOnly",
    "variants",
    "options",
    "addons",
  ],

  savedReply: ["shortcut", "text", "images"],
  botField: ["name", "type", "description"],
  customField: ["name", "type", "description"],
  tag: ["name"],
  folder: ["name"],
  sequence: ["name", "steps"],
  // The URL is not locked: it ships as a bare origin, and the installer has to
  // complete it with their own address and credential.
  aiMcpServer: ["name", "selectedTools"],
  // The stored bytes never change; re-chunking is the one content edit.
  aiFile: ["chunkingConfig"],
  questionnaire: [
    "name",
    "enableScore",
    "enableRetryMessages",
    "enableCustomFieldMapping",
    "triggerFlowId",
    "questions",
  ],
  couponTopic: ["name", "description", "expiresAt"],
  pipeline: ["name", "referenceName", "settings", "stages", "fields"],
  productCategory: ["name", "parentId", "imageUrl"],
}
