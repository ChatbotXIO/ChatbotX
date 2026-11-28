import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  type ContactTouchpointKind,
  contactTouchpointDetailsSchemas,
  contactTouchpointKinds,
} from "@chatbotx.io/database/partials"
import {
  type ContactTouchpointCursor,
  type ContactTouchpointRow,
  contactTouchpointRepository,
} from "@chatbotx.io/database/repositories"
import { isBigintId } from "@chatbotx.io/database/utils"
import { z } from "zod"
import { type ContactAccessScope, contactService } from "../contact/service"
import { ChatbotXException } from "../errors"

type ContactTouchpointDetails = {
  [Kind in ContactTouchpointKind]: z.infer<
    (typeof contactTouchpointDetailsSchemas)[Kind]
  >
}

/** One kind's row with its typed `details`; the union is discriminated by `kind`. */
type ContactTouchpointOfKind<Kind extends ContactTouchpointKind> = {
  kind: Kind
  /** Id of the tool item (a minigame, a link, ...), unique within a kind. */
  resourceKey: string
  resourceName: string | null
  occurredAt: Date
  channel: string | null
  inboxId: string | null
  details: ContactTouchpointDetails[Kind]
}

export type ContactTouchpoint = {
  [Kind in ContactTouchpointKind]: ContactTouchpointOfKind<Kind>
}[ContactTouchpointKind]

export type ListContactTouchpointsResult = {
  data: ContactTouchpoint[]
  /** Opaque; pass it back as `cursor`. Null on the last page. */
  nextCursor: string | null
}

/** A real calendar instant: `2026-02-30` parses but rolls over, so it fails the round trip. */
const isRealInstant = (value: string): boolean => {
  const millis = value.slice(0, 23)
  const parsed = new Date(`${millis}Z`)
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString() === `${millis}Z`
  )
}

/** Compact keys keep the cursor short in a URL. */
const cursorSchema = z.object({
  o: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/)
    .refine(isRealInstant)
    .describe("occurredAt, microsecond precision, UTC"),
  k: contactTouchpointKinds,
  // Zod runs a refine even after a failed regex, and `BigInt` throws on a
  // non-numeric value, so one digits-length-range check carries the rule.
  r: z.string().refine(isBigintId),
})

const encodeCursor = (cursor: ContactTouchpointCursor): string =>
  Buffer.from(
    JSON.stringify({
      o: cursor.occurredAt,
      k: cursor.kind,
      r: cursor.resourceKey,
    }),
  ).toString("base64url")

const invalidCursor = () =>
  new ChatbotXException(
    "The cursor is invalid. Start again without a cursor.",
    "invalidCursor",
    400,
  )

/** A corrupt cursor must not restart at page 1: a client appending pages would repeat rows. */
const decodeCursor = (cursor: string): ContactTouchpointCursor => {
  let json: unknown
  try {
    json = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
  } catch {
    throw invalidCursor()
  }
  const parsed = cursorSchema.safeParse(json)
  if (!parsed.success) {
    throw invalidCursor()
  }
  return {
    occurredAt: parsed.data.o,
    kind: parsed.data.k,
    resourceKey: parsed.data.r,
  }
}

const toTouchpoint = (row: ContactTouchpointRow): ContactTouchpoint => {
  const details = contactTouchpointDetailsSchemas[row.kind].parse(row.details)
  // `kind` and `details` were validated together above; TypeScript cannot
  // correlate the two across the union.
  return {
    kind: row.kind,
    resourceKey: row.resourceKey,
    resourceName: row.resourceName,
    occurredAt: row.occurredAt,
    channel: row.channel,
    inboxId: row.inboxId,
    details,
  } as ContactTouchpoint
}

export const contactTouchpointService = {
  /**
   * The tools a contact opted in through, and how the conversation started,
   * newest first. Derived on read (no table); see the repository for each
   * kind's rule. `accessScope` applies the "only assigned contacts"
   * permission, as for the contact itself, and the contact is proven to belong
   * to the workspace before anything else is read.
   *
   * A live view, not a snapshot: a "latest" row can move to an earlier page
   * between two calls. Clients dedupe by `(kind, resourceKey)` and restart
   * from the first page on refetch.
   */
  async list(
    input: {
      workspaceId: string
      contactId: string
      accessScope?: ContactAccessScope
      kinds?: ContactTouchpointKind[]
      perPage: number
      cursor?: string
    },
    tx: DatabaseClient = db,
  ): Promise<ListContactTouchpointsResult> {
    await contactService.findByIdOrFail({
      workspaceId: input.workspaceId,
      id: input.contactId,
      accessScope: input.accessScope,
      tx,
    })
    const cursor = input.cursor ? decodeCursor(input.cursor) : undefined

    const rows = await contactTouchpointRepository.listByContact(
      {
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        kinds: input.kinds,
        limit: input.perPage + 1,
        cursor,
      },
      tx,
    )
    const page = rows.slice(0, input.perPage)
    const last = page.at(-1)
    return {
      data: page.map(toTouchpoint),
      nextCursor:
        rows.length > input.perPage && last
          ? encodeCursor({
              occurredAt: last.occurredAtKey,
              kind: last.kind,
              resourceKey: last.resourceKey,
            })
          : null,
    }
  },
}
