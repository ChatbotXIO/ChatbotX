import { db } from "@chatbotx.io/database/client"
import {
  appointmentCalendarModel,
  appointmentModel,
  attachmentModel,
  contactInboxModel,
  contactModel,
  conversationModel,
  inboxModel,
  inboxTeamMemberModel,
  inboxTeamModel,
  integrationInstagramModel,
  integrationMessengerModel,
  integrationWhatsappModel,
  messageModel,
  questionnaireModel,
  questionnaireSubmissionModel,
  userModel,
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"

let counter = 0
const nextCounter = (): number => {
  counter += 1
  return counter
}

/** Unique, readable suffix so seeded emails/ids never collide across tests. */
export const uniq = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${nextCounter()}`

/** A unique, digits-only id (page ids, PSIDs, phone ids are numeric strings). */
export const numericId = (): string =>
  `${Date.now()}${String(nextCounter()).padStart(4, "0")}${Math.floor(
    Math.random() * 1000,
  )
    .toString()
    .padStart(3, "0")}`

export const seedUser = async (name: string | null = "Test User") => {
  const [user] = await db
    .insert(userModel)
    .values({ id: createId(), email: `${uniq("user")}@example.test`, name })
    .returning()
  if (!user) {
    throw new Error("seedUser failed")
  }
  return user
}

/** A workspace with its owner (also an `owner` member). */
export const seedWorkspace = async () => {
  const owner = await seedUser("Owner")
  const [workspace] = await db
    .insert(workspaceModel)
    .values({ id: createId(), name: uniq("ws"), ownerId: owner.id })
    .returning()
  if (!workspace) {
    throw new Error("seedWorkspace failed")
  }
  await db.insert(workspaceMemberModel).values({
    id: createId(),
    workspaceId: workspace.id,
    userId: owner.id,
    role: "owner",
  })
  return { owner, workspace }
}

export const seedAgent = async (workspaceId: string, name: string | null) => {
  const user = await seedUser(name)
  await db.insert(workspaceMemberModel).values({
    id: createId(),
    workspaceId,
    userId: user.id,
    role: "agent",
  })
  return user
}

const oauth2Auth = (
  accessToken: string,
  metadata: Record<string, unknown>,
) => ({
  authType: "oauth2",
  clientId: "e2e-app",
  clientSecret: "e2e-secret",
  redirectUrl: "https://example.test/callback",
  tokens: { accessToken },
  metadata,
})

export type SeededChannel = {
  inboxId: string
  channel: "messenger" | "instagram" | "whatsapp"
  identifier: string
}

export const seedMessengerChannel = async (
  workspaceId: string,
  pageId: string,
): Promise<SeededChannel> => {
  const inboxId = createId()
  await db.insert(inboxModel).values({
    id: inboxId,
    name: `Page ${pageId}`,
    channel: "messenger",
    sourceId: pageId,
    workspaceId,
  })
  await db.insert(integrationMessengerModel).values({
    id: createId(),
    auth: oauth2Auth("page-token", {
      pageId,
      pageName: `Page ${pageId}`,
      version: "v23.0",
    }),
    pageId,
    name: `Page ${pageId}`,
    conversationStarters: [],
    persistentMenus: [],
    personas: [],
    workspaceId,
    inboxId,
  })
  return { inboxId, channel: "messenger", identifier: pageId }
}

export const seedInstagramChannel = async (
  workspaceId: string,
  igId: string,
): Promise<SeededChannel> => {
  const inboxId = createId()
  await db.insert(inboxModel).values({
    id: inboxId,
    name: `IG ${igId}`,
    channel: "instagram",
    sourceId: igId,
    workspaceId,
  })
  await db.insert(integrationInstagramModel).values({
    id: createId(),
    auth: oauth2Auth("ig-token", {
      igId,
      igName: `ig_${igId}`,
      pageId: `page-${igId}`,
      version: "v23.0",
    }),
    igId,
    pageId: `page-${igId}`,
    name: `IG ${igId}`,
    username: `ig_${igId}`,
    conversationStarters: [],
    persistentMenus: [],
    workspaceId,
    inboxId,
  })
  return { inboxId, channel: "instagram", identifier: igId }
}

export type SeededContact = {
  contactId: string
  contactInboxId: string
  conversationId: string
  sourceId: string
}

/** A contact already known on `channel`, with its inbox row and conversation. */
export const seedContact = async (input: {
  workspaceId: string
  inboxId: string
  channel: string
  sourceId: string
  firstName?: string
}): Promise<SeededContact> => {
  const contactId = createId()
  const contactInboxId = createId()
  const conversationId = createId()
  await db.insert(contactModel).values({
    id: contactId,
    workspaceId: input.workspaceId,
    firstName: input.firstName ?? "Seeded",
    fullName: input.firstName ?? "Seeded",
  })
  await db.insert(contactInboxModel).values({
    id: contactInboxId,
    originalContactId: contactId,
    contactId,
    inboxId: input.inboxId,
    channel: input.channel,
    source: "direct",
    sourceId: input.sourceId,
  })
  await db.insert(conversationModel).values({
    id: conversationId,
    workspaceId: input.workspaceId,
    contactId,
  })
  return {
    contactId,
    contactInboxId,
    conversationId,
    sourceId: input.sourceId,
  }
}

export const seedWhatsappChannel = async (
  workspaceId: string,
  phoneNumberId: string,
): Promise<SeededChannel> => {
  const inboxId = createId()
  const wabaId = `waba-${phoneNumberId}`
  await db.insert(inboxModel).values({
    id: inboxId,
    name: `WA ${phoneNumberId}`,
    channel: "whatsapp",
    sourceId: phoneNumberId,
    workspaceId,
  })
  await db.insert(integrationWhatsappModel).values({
    id: createId(),
    auth: oauth2Auth("wa-token", {
      wabaId,
      businessId: `biz-${phoneNumberId}`,
      phoneNumber: {
        id: phoneNumberId,
        verified_name: "E2E",
        code_verification_status: "VERIFIED",
        display_phone_number: "15550001111",
        quality_rating: "GREEN",
        platform_type: "CLOUD_API",
        throughput: {},
        webhook_configuration: {},
      },
      webhookUrl: "https://example.test/webhook",
      isManual: true,
    }),
    phoneNumberId,
    wabaId,
    businessId: `biz-${phoneNumberId}`,
    name: `WA ${phoneNumberId}`,
    workspaceId,
    inboxId,
  })
  return { inboxId, channel: "whatsapp", identifier: phoneNumberId }
}

export const seedTeam = async (
  workspaceId: string,
  name: string,
  userIds: string[],
) => {
  const teamId = createId()
  await db.insert(inboxTeamModel).values({ id: teamId, workspaceId, name })
  for (const userId of userIds) {
    await db
      .insert(inboxTeamMemberModel)
      .values({ id: createId(), inboxTeamId: teamId, userId })
  }
  return teamId
}

export const seedQuestionnaire = async (workspaceId: string) => {
  const id = createId()
  await db
    .insert(questionnaireModel)
    .values({ id, workspaceId, name: uniq("questionnaire") })
  return id
}

export const seedSubmission = async (input: {
  workspaceId: string
  questionnaireId: string
  contactId: string
  status: "inProgress" | "completed" | "cancelled" | "failed" | "timeout"
  totalPoints: number | null
  completedAt: Date | null
}) => {
  const id = createId()
  await db.insert(questionnaireSubmissionModel).values({ id, ...input })
  return id
}

export const seedCalendar = async (workspaceId: string) => {
  const id = createId()
  await db.insert(appointmentCalendarModel).values({
    id,
    workspaceId,
    name: uniq("calendar"),
    timezone: "UTC",
    locationType: "onlineMeeting",
    publicLinkSlug: uniq("slug"),
  })
  return id
}

export const seedAppointment = async (input: {
  workspaceId: string
  calendarId: string
  contactId: string
  startAt: Date
  status?: "scheduled" | "cancelled"
  createdAt?: Date
  deletedAt?: Date | null
}) => {
  const id = createId()
  await db.insert(appointmentModel).values({
    id,
    workspaceId: input.workspaceId,
    calendarId: input.calendarId,
    contactId: input.contactId,
    startAt: input.startAt,
    endAt: new Date(input.startAt.getTime() + 30 * 60_000),
    inviteeTimezone: "UTC",
    locationType: "onlineMeeting",
    status: input.status ?? "scheduled",
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    deletedAt: input.deletedAt ?? null,
  })
  return id
}

export const seedMessage = async (input: {
  workspaceId: string
  conversationId: string
  contactInboxId: string
  direction: "incoming" | "outgoing"
  text: string | null
  createdAt: Date
  attachment?: { fileType: "image" | "file"; originPath: string }
}) => {
  const id = createId()
  await db.insert(messageModel).values({
    id,
    createdAt: input.createdAt,
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    contactInboxId: input.contactInboxId,
    messageType: input.direction,
    contentType: "text",
    senderType: input.direction === "incoming" ? "contact" : "bot",
    text: input.text,
  })
  if (input.attachment) {
    await db.insert(attachmentModel).values({
      id: createId(),
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      messageId: id,
      messageCreatedAt: input.createdAt,
      fileType: input.attachment.fileType,
      mimeType: "image/png",
      originPath: input.attachment.originPath,
    })
  }
  return id
}
