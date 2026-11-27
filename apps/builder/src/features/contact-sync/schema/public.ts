import {
  CONTACT_SYNC_FOLLOW_UP_ERRORS,
  CONTACT_SYNC_MAX_SOURCES_PER_RUN,
  contactSyncActorTypes,
  contactSyncMappingOrigins,
  contactSyncProviders,
  contactSyncRunItemStatuses,
  contactSyncRunStatuses,
  contactSyncSourceChannels,
  contactSyncTriggers,
  customFieldTypes,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"

const inboxIdParam = zodBigintAsString().describe(
  "Inbox id of the connected page (Messenger, Instagram, Zalo or Telegram). Get it from `contactSyncs.listSources`.",
)

const externalFieldType = z.enum([
  "text",
  "number",
  "date",
  "datetime",
  "boolean",
  "json",
  "array",
])

const contactSyncDiscoveryStatuses = z.enum([
  "found",
  "absent",
  "ambiguous",
  "unavailable",
])

const contactSyncIneligibleReasons = z.enum([
  "notInAhachat",
  "pageAmbiguous",
  "ahachatUnavailable",
])

/** A connected page of the workspace, with whether AhaChat has it (no AhaChat credentials involved). */
export const contactSyncSourceResource = z.object({
  inboxId: zodBigintAsString(),
  inboxName: z.string(),
  channel: contactSyncSourceChannels,
  accountId: z.string().describe("The page / account id on the platform."),
  provider: contactSyncProviders,
  discovery: contactSyncDiscoveryStatuses.describe(
    "Whether AhaChat has this page: `found`, `absent`, `ambiguous` (more than one AhaChat record claims it) or `unavailable` (AhaChat could not be asked: retry).",
  ),
  sourceName: z.string().nullable().describe("The page's name in AhaChat."),
  sourceAvatarUrl: z.string().nullable(),
  eligible: z.boolean(),
  ineligibleReason: contactSyncIneligibleReasons.nullable(),
})

export const listContactSyncSourcesPublicRequest = z.object({
  provider: contactSyncProviders
    .optional()
    .describe("Only sources of this provider; every provider when omitted."),
})
export const listContactSyncSourcesPublicResponse = z.object({
  data: z.array(contactSyncSourceResource),
})

export const getContactSyncSchemaPublicRequest = z.object({
  inboxId: inboxIdParam,
})
export const getContactSyncSchemaPublicResponse = z.object({
  tags: z.array(
    z.object({
      id: z.string().describe("Tag id on the source."),
      name: z.string(),
      mapping: z
        .object({
          tagId: zodBigintAsString(),
          tagName: z.string().nullable(),
          origin: contactSyncMappingOrigins,
        })
        .nullable()
        .describe(
          "Workspace tag it lands on; `null` = matched by name (created when missing) at sync time.",
        ),
    }),
  ),
  fields: z.array(
    z.object({
      id: z.string().describe("Custom field id on the source."),
      name: z.string(),
      type: externalFieldType,
      defaultTargetType: customFieldTypes,
      compatibleTargetTypes: z.array(customFieldTypes),
      mapping: z
        .object({
          customFieldId: zodBigintAsString(),
          customFieldName: z.string().nullable(),
          customFieldType: customFieldTypes,
          origin: contactSyncMappingOrigins,
          typeMismatch: z
            .boolean()
            .describe(
              "`true` = values of this field are skipped at sync time.",
            ),
        })
        .nullable()
        .describe(
          "Workspace field it lands on; `null` = same name and type reused at sync time, or `<name> copy` created when the name is taken by another type.",
        ),
    }),
  ),
})

export const saveContactSyncMappingsPublicRequest = z.object({
  inboxId: inboxIdParam,
  tags: z
    .array(
      z.object({
        externalId: z
          .string()
          .describe("Tag id on the source (`contactSyncs.getSchema`)."),
        target: z
          .union([
            z.object({ tagId: zodBigintAsString() }),
            z.object({
              tagName: z
                .string()
                .min(1)
                .describe("Exact (case-sensitive) name of an existing tag."),
            }),
          ])
          .nullable()
          .describe(
            "Workspace tag by id or exact name; `null` removes the mapping.",
          ),
      }),
    )
    .optional()
    .describe("Tag mappings to set; tags not listed keep their mapping."),
  fields: z
    .array(
      z.object({
        externalId: z
          .string()
          .describe("Field id on the source (`contactSyncs.getSchema`)."),
        target: z
          .union([
            z.object({ customFieldId: zodBigintAsString() }),
            z.object({
              customFieldName: z.string().min(1),
              customFieldType: customFieldTypes.describe(
                "Required with a name: the same name can exist once per type.",
              ),
            }),
          ])
          .nullable()
          .describe(
            "Workspace field by id, or by exact name plus type; must be one of `compatibleTargetTypes`. `null` removes the mapping.",
          ),
      }),
    )
    .optional()
    .describe("Field mappings to set; fields not listed keep their mapping."),
})

export const createContactSyncPublicRequest = z.object({
  sources: z
    .array(
      z.object({
        inboxId: inboxIdParam,
      }),
    )
    .min(1)
    .max(CONTACT_SYNC_MAX_SOURCES_PER_RUN)
    .describe("Pages to import, processed one after the other."),
  syncTags: z
    .boolean()
    .default(true)
    .describe("Attach the source tags to the contacts (tags are only added)."),
  syncCustomFields: z
    .boolean()
    .default(true)
    .describe(
      "Copy the source custom-field values, through `contactSyncs.saveMappings` mappings.",
    ),
  overwriteExisting: z
    .boolean()
    .default(false)
    .describe(
      "`false`: an existing contact only gets values it is missing. `true`: source values replace existing ones. An empty source value never clears data; tags are only ever added.",
    ),
})
export const createContactSyncPublicResponse = z.object({
  runId: zodBigintAsString(),
})

export const contactSyncRunItemResource = z.object({
  id: zodBigintAsString(),
  position: z.number().int(),
  inboxId: zodBigintAsString().nullable(),
  sourceChannel: contactSyncSourceChannels,
  sourceAccountId: z.string(),
  sourceAccountName: z.string().nullable(),
  status: contactSyncRunItemStatuses,
  createdCount: z.number().int(),
  updatedCount: z.number().int(),
  skippedCount: z.number().int(),
  failedCount: z.number().int(),
  skippedValueCount: z
    .number()
    .int()
    .describe(
      "Custom-field values not written: mapped to an incompatible type, or invalid for the target type.",
    ),
  currentError: z.string().nullable(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  followUpCoexist: z
    .boolean()
    .describe(
      "Connect import only: the normal history sync runs once this import ended.",
    ),
  followUpAiReadsSyncedHistory: z.boolean(),
  followUpRunId: zodBigintAsString()
    .nullable()
    .describe("The history sync (coexist) run this import handed off to."),
  followUpError: z
    .enum(CONTACT_SYNC_FOLLOW_UP_ERRORS)
    .nullable()
    .describe(
      "Why the history sync will not follow this import: `cancelled`, `channelUnavailable`, `workspaceUnavailable` or `expired` (retry with `contactSyncs.retryHistory`), or `superseded` (a newer import of the page starts it: nothing to do).",
    ),
})

/** No `workspaceId`: `public-spec-operations.test.ts` fails a public response carrying one. */
export const contactSyncRunResource = z.object({
  id: zodBigintAsString(),
  provider: contactSyncProviders,
  status: contactSyncRunStatuses,
  syncTags: z.boolean(),
  syncCustomFields: z.boolean(),
  overwriteExisting: z.boolean(),
  trigger: contactSyncTriggers.describe(
    "`menu` = started from Contacts or the API; `connect` = the contacts-first import at page connect.",
  ),
  requestedByType: contactSyncActorTypes,
  requestedById: z.string().describe("The user or API token that asked."),
  currentError: z.string().nullable(),
  createdAt: z.date(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  items: z.array(contactSyncRunItemResource),
})

export const contactSyncRunIdRequest = z.object({
  runId: zodBigintAsString().describe(
    "Run id returned by `contactSyncs.create` or listed by `contactSyncs.list`.",
  ),
})

export const cancelContactSyncPublicResponse = z.object({
  cancelled: z
    .boolean()
    .describe("`false` when the run had already finished (not an error)."),
})

export const contactSyncAvailabilityResponse = z.object({
  canSync: z.boolean(),
  blockedReason: z.enum(["running", "cooldown"]).nullable(),
  nextSyncAt: z
    .date()
    .nullable()
    .describe("When a new sync may start (4 hours after the last one)."),
  activeRunId: zodBigintAsString().nullable(),
})

export const listContactSyncsPublicRequest = publicListRequest
export const listContactSyncsPublicResponse = publicListResponse(
  contactSyncRunResource,
)

export const retryContactSyncHistoryRequest = z.object({
  inboxId: inboxIdParam,
})
export const retryContactSyncHistoryResponse = z.object({
  reopened: z
    .boolean()
    .describe(
      "`true` = the page's owed history sync was re-opened and starts within a minute; `false` = nothing was waiting.",
    ),
})

const contactSyncConnectFallbackReasons = z.enum([
  "tooManyPages",
  "workspaceBusy",
  "historyRunning",
  "channelUnsupported",
  "inboxNotConnected",
  "notInAhachat",
  "pageAmbiguous",
  "ahachatUnavailable",
])

export const startContactImportRequest = z.object({
  pages: z
    .array(
      z.object({
        inboxId: inboxIdParam,
        aiReadsSyncedHistory: z
          .boolean()
          .default(false)
          .describe(
            "Let the AI read the history synced afterwards (default false).",
          ),
      }),
    )
    .min(1)
    .max(200)
    .describe("The just-connected Messenger / Instagram pages to import."),
})
export const startContactImportResponse = z.object({
  runId: zodBigintAsString()
    .nullable()
    .describe("The contacts-import run, or `null` when no page needed one."),
  pages: z.array(
    z.object({
      inboxId: zodBigintAsString(),
      outcome: z
        .enum(["started", "attached", "fallback"])
        .describe(
          "`started` = imported in the new run; `attached` = an import of this page was already running and will now also start the history sync; `fallback` = not imported, see `fallbackReason`.",
        ),
      fallbackReason: contactSyncConnectFallbackReasons.nullable(),
      historyStarted: z
        .boolean()
        .describe(
          "A fallback page's normal history sync was started (or was already running).",
        ),
    }),
  ),
})
