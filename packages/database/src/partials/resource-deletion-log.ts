import { z } from "zod"

/**
 * The kind of resource a `ResourceDeletionLog` row is about. Logging a new kind
 * of deletion (a contact, a flow, a team member…) is one more value here — the
 * table itself does not change.
 */
export const resourceDeletionResourceTypes = z.enum(["workspace", "channel"])
export type ResourceDeletionResourceType = z.infer<
  typeof resourceDeletionResourceTypes
>

/**
 * `pending` from the moment a deletion is requested until it really happens;
 * `completed` once the resource is gone; `canceled` when the request was
 * withdrawn or superseded by a newer one before that.
 */
export const resourceDeletionStatuses = z.enum([
  "pending",
  "completed",
  "canceled",
])
export type ResourceDeletionStatus = z.infer<typeof resourceDeletionStatuses>
