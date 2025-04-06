import { Prisma, prisma, type Inbox } from "@ahachat.ai/database"

export async function getIntegrationAuth(inbox: Inbox) {
  const inboxName = inbox.inboxType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("")

  const integrationTable = `Integration${inboxName}`
  const result = await prisma.$queryRaw<
    { auth: unknown }[]
  >`SELECT auth FROM ${Prisma.sql([`"${integrationTable}"`])} WHERE "inboxId" = ${Prisma.sql([`'${inbox.id}'`])} LIMIT 1`

  return result[0].auth ?? null
}
