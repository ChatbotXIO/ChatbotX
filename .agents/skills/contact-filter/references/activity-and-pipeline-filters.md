# Contact filter: activity-backed and pipeline item filters

## Activity-backed fields (Executed Flow/Step, Keywords Received, Sent message, Last Delivered, Completed WhatsApp Flows, Clicked ad, Email Sent/Delivered/Opened/Clicked)

These read the partitioned, FK-less contact-activity store (`ContactActivity`,
`ContactKeywordMessage`, `ContactState`), not the contact row. One registry,
`CONTACT_ACTIVITY_FILTERS` in `packages/database/src/partials/contact-activity.ts`,
drives storage, writers, the SQL (`queries/contact-filter/contact-activity.ts`),
discovery and labels; a new reference type is one enum value plus one row.

- **No backfill.** Activity is recorded from release onward, so `Is Not` and
  `Has no value` mean "since tracking began". Discovery reports
  `getContactActivityTrackingStartedAt(field)` (the store date unless the field has
  its own) and the dialog shows a hint.
- **Values** are validated by one parser, `parseContactActivityReferences`,
  shared by Zod (4xx) and SQL (fail closed): ids are positive bigints, an
  `Executed Step` is `flowId:nodeId` (a node id alone is not unique), and
  `noTopic` is the fixed email "No Topic" bucket. Max 500 values.
- **Fail closed, never `{}`**: malformed value, unknown operator, missing
  workspace or the kill switch all render `FALSE`, so an AND audience never
  widens. Negatives are `NOT EXISTS`, so a contact with no history matches them.
- **Every subquery** carries a parameterized `"workspaceId" =` (hash partition pruning).
- **Kill switch** `CONTACT_ACTIVITY_FILTERS_ENABLED` (database `keys.ts`,
  default on): discovery and the picker hide the activity fields. Writers have their
  own `CONTACT_ACTIVITY_WRITES_ENABLED` (business).
- **Discovery** (`contacts.listFilterFields`): each field has `operators` and,
  for these fields, `valueSource` = `{ operation, scope, fixedValues, valueFormat,
  trackingStartedAt }` (`flows.list`, `flows.listNodes`, `keywords.list`,
  `whatsappFlows.list`, `emailTopics.list`, `ads.listReferralAds`).
  `trackingStartedAt` is per field (`getContactActivityTrackingStartedAt`).
- **Pickers**: keywords / WhatsApp Flows / email topics / ads are searched on the
  server (`contactFilterAPI.listActivityValueOptionsAPI`, one bounded page, no
  client cache); selected values are named by id through the value-label lookup.

## Pipeline item filter (`pipelineItem`)

Dynamic condition `{ field: "pipelineItem", attribute, pipelineId, operator, value }`,
a discriminated union on `attribute` (`schema/pipeline-item-filter.ts`):
`exists` (`isNotEmpty|isEmpty`, value `any|open|won|lost`), `status` and
`priority` (`in|notIn`, non-empty list), `stage` (`in|notIn`, stage ids, needs a
`pipelineId`; `null` = any pipeline for the others). SQL is
`queries/contact-filter/pipeline-item.ts`: a workspace-scoped correlated
`EXISTS` over `PipelineItem`, and `NOT EXISTS` for `isEmpty`/`notIn`, so a
contact with no matching item satisfies the negatives. Malformed saved values
fail closed (`FALSE`). The UI offers one `FieldConfig` per attribute for "any
pipeline" and per pipeline (`pipeline-item-filter-config.ts`, name
`pipelineItem:<attribute>:<pipelineId|any>`); ids are named through the
`pipelines` / `pipelineStages` value-label lookups; discovery reports them in
`contacts.listFilterFields` → `pipelineItems`.
