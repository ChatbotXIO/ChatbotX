import { db, type Transaction } from "@chatbotx.io/database/client"
import { contactsOnSequenceModel } from "@chatbotx.io/database/schema"
import { sequenceConnections } from "@chatbotx.io/redis"
import { SchedulerClient } from "@chatbotx.io/scheduler"
import { createId } from "@chatbotx.io/utils"
import { getContactInboxes } from "./contacts-on-sequences"
import { createDispatch } from "./dispatch-manager"

type DrizzleClient = typeof db | Transaction

export type EnrollContactParams = {
  workspaceId: string
  client?: DrizzleClient
  contactId: string
  enrolledAt?: Date
  nextRunAt: Date
  nextStepId: string | null
  sequenceId: string
}

export async function enrollContactInSequence(params: EnrollContactParams) {
  const {
    workspaceId,
    contactId,
    sequenceId,
    nextRunAt,
    nextStepId,
    enrolledAt = new Date(),
    client = db,
  } = params

  const existing = await client.query.contactsOnSequenceModel.findFirst({
    where: {
      contactId,
      sequenceId,
      workspaceId,
    },
    columns: { id: true },
  })

  if (existing) {
    return
  }

  const enrollmentId = createId()
  const [enrollment] = await client
    .insert(contactsOnSequenceModel)
    .values({
      id: enrollmentId,
      workspaceId,
      contactId,
      sequenceId,
      currentStep: 0,
      status: "active",
      nextRunAt,
      nextStepId,
      enrolledAt,
    })
    .returning({ id: contactsOnSequenceModel.id })

  if (!(nextStepId && enrollment)) {
    return
  }

  const contactInboxes = await getContactInboxes(workspaceId, contactId)

  for (const contactInbox of contactInboxes) {
    const dispatch = await createDispatch({
      workspaceId,
      sequenceId,
      contactId,
      contactInboxId: contactInbox.id,
      stepId: nextStepId,
      enrollmentId: enrollment.id,
      runAt: nextRunAt,
      client,
    })

    const redisClient = await sequenceConnections.useExisting()
    const scheduler = new SchedulerClient(redisClient)
    await scheduler.addToSchedule(
      dispatch.bucket,
      dispatch.id,
      dispatch.runAtMs,
    )
  }
}
export interface EnrollContactsBulkParams {
  enrolledAt?: Date
  enrollments: Array<{
    contactId: string
    sequenceId: string
    nextRunAt: Date
    nextStepId: string | null
  }>
  workspaceId: string
}
export async function enrollContactsInSequenceBulk(
  params: EnrollContactsBulkParams,
) {
  const { workspaceId, enrollments, enrolledAt = new Date() } = params
  const createdEnrollments = await db.transaction(async (tx) => {
    await tx
      .insert(contactsOnSequenceModel)
      .values(
        enrollments.map((e) => ({
          id: createId(),
          workspaceId,
          contactId: e.contactId,
          sequenceId: e.sequenceId,
          currentStep: 0,
          status: "active" as const,
          nextRunAt: e.nextRunAt,
          nextStepId: e.nextStepId,
          enrolledAt,
        })),
      )
      .onConflictDoNothing()

    const contactIds = enrollments.map((e) => e.contactId)
    const sequenceIds = enrollments.map((e) => e.sequenceId)

    return await tx.query.contactsOnSequenceModel.findMany({
      where: {
        workspaceId,
        contactId: { in: contactIds },
        sequenceId: { in: sequenceIds },
      },
      columns: {
        id: true,
        contactId: true,
        sequenceId: true,
        nextRunAt: true,
        nextStepId: true,
      },
    })
  })
  const redisClient = await sequenceConnections.useExisting()
  const scheduler = new SchedulerClient(redisClient)
  for (const enrollment of createdEnrollments) {
    if (!(enrollment.nextStepId && enrollment.nextRunAt)) {
      continue
    }

    const contactInboxes = await getContactInboxes(
      workspaceId,
      enrollment.contactId,
    )

    for (const contactInbox of contactInboxes) {
      const dispatch = await createDispatch({
        workspaceId,
        sequenceId: enrollment.sequenceId,
        contactId: enrollment.contactId,
        contactInboxId: contactInbox.id,
        stepId: enrollment.nextStepId,
        enrollmentId: enrollment.id,
        runAt: enrollment.nextRunAt,
      })

      await scheduler.addToSchedule(
        dispatch.bucket,
        dispatch.id,
        dispatch.runAtMs,
      )
    }
  }
}
