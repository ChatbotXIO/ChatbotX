"use server"

import {
  and,
  type DatabaseClient,
  db,
  eq,
  findOrFail,
  inArray,
} from "@chatbotx.io/database/client"
import {
  contactModel,
  contactsOnSequenceModel,
} from "@chatbotx.io/database/schema"
import {
  cancelPendingDispatches,
  enrollContactInSequence,
} from "@chatbotx.io/sequence-scheduler"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateContactSequenceRequest } from "../schema"
import { calculateNextRunAtBulk } from "../utils/calculate-next-run-at"

async function getCurrentSequenceIds(
  tx: DatabaseClient,
  contactId: string,
  workspaceId: string,
) {
  const sequences = await tx
    .select({ sequenceId: contactsOnSequenceModel.sequenceId })
    .from(contactsOnSequenceModel)
    .where(
      and(
        eq(contactsOnSequenceModel.contactId, contactId),
        eq(contactsOnSequenceModel.workspaceId, workspaceId),
      ),
    )
  return sequences.map((s) => s.sequenceId)
}

function calculateSequenceDiff(
  currentIds: string[],
  newIds: string[],
): { toAdd: string[]; toRemove: string[] } {
  const currentSet = new Set(currentIds)
  const newSet = new Set(newIds)

  return {
    toAdd: newIds.filter((id) => !currentSet.has(id)),
    toRemove: currentIds.filter((id) => !newSet.has(id)),
  }
}

async function removeContactSequences(
  tx: DatabaseClient,
  contactId: string,
  sequenceIds: string[],
  workspaceId: string,
) {
  if (sequenceIds.length === 0) {
    return
  }

  const enrollments = await tx
    .select({ id: contactsOnSequenceModel.id })
    .from(contactsOnSequenceModel)
    .where(
      and(
        eq(contactsOnSequenceModel.contactId, contactId),
        inArray(contactsOnSequenceModel.sequenceId, sequenceIds),
        eq(contactsOnSequenceModel.workspaceId, workspaceId),
      ),
    )
  if (enrollments.length === 0) {
    return
  }

  const enrollmentIds = enrollments.map((e: { id: string }) => e.id)
  if (enrollmentIds.length > 0) {
    await tx
      .delete(contactsOnSequenceModel)
      .where(
        and(
          inArray(contactsOnSequenceModel.id, enrollmentIds),
          eq(contactsOnSequenceModel.workspaceId, workspaceId),
        ),
      )
  }

  await Promise.all(
    enrollments.map((enrollment: { id: string }) =>
      cancelPendingDispatches({
        client: tx,
        enrollmentId: enrollment.id,
        workspaceId,
        reason: "enrollment_removed",
      }),
    ),
  )
}

async function addContactSequences(
  tx: DatabaseClient,
  contactId: string,
  sequenceIds: string[],
  workspaceId: string,
) {
  if (sequenceIds.length === 0) {
    return
  }

  const now = new Date()
  const nextRunAtMap = await calculateNextRunAtBulk(sequenceIds, now, tx)

  for (const sequenceId of sequenceIds) {
    const result = nextRunAtMap.get(sequenceId) ?? {
      nextRunAt: now,
      nextStepId: null,
    }

    await enrollContactInSequence({
      workspaceId,
      contactId,
      sequenceId,
      nextRunAt: result.nextRunAt,
      nextStepId: result.nextStepId,
      enrolledAt: now,
      client: tx,
    })
  }
}

export const updateContactSequenceAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateContactSequenceRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props

    const contact = await findOrFail({
      table: contactModel,
      where: {
        id: parsedInput.contactId,
        workspaceId,
      },
      message: "Contact not found",
    })

    const currentIds = await getCurrentSequenceIds(db, contact.id, workspaceId)

    const { toAdd, toRemove } = calculateSequenceDiff(
      currentIds,
      parsedInput.sequences,
    )

    await removeContactSequences(db, contact.id, toRemove, workspaceId)
    await addContactSequences(db, contact.id, toAdd, workspaceId)

    const returnedSequences = await db.query.contactsOnSequenceModel.findMany({
      where: {
        contactId: contact.id,
        workspaceId,
      },
      with: { sequence: true },
    })

    revalidateCacheTags([
      `workspaces:${workspaceId}#contacts`,
      `workspaces:${workspaceId}#conversations`,
      `workspaces:${workspaceId}#sequences`,
    ])

    return returnedSequences
  })
