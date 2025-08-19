import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "./generated/prisma/client"
import { keys } from "./keys"

const env = keys()
const pool = new PrismaPg({ connectionString: env.DATABASE_URL })
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter: pool,
    log: env.PRISMA_DEBUG ? ["query"] : [],
  }).$extends({
    // query: enableDebug
    //   ? {
    //       $allModels: {
    //         async $allOperations({ operation, model, args, query }) {
    //           console.log("debugggg", arguments)
    //           const start = performance.now()
    //           const result = await query(args)
    //           const end = performance.now()
    //           const time = end - start
    //           console.log(
    //             util.inspect(
    //               { query, time },
    //               { showHidden: false, depth: null, colors: true },
    //             ),
    //           )
    //           return result
    //         },
    //       },
    //     }
    //   : undefined,
    result: {
      contact: {
        fullName: {
          needs: { firstName: true, lastName: true, phoneNumber: true },
          compute(contact) {
            if (contact.firstName || contact.lastName) {
              return [contact.firstName, contact.lastName]
                .filter((v) => Boolean(v))
                .join(" ")
            }

            return contact.phoneNumber || "-"
          },
        },
      },
      conversation: {
        assignedId: {
          needs: {
            assignedUserId: true,
            assignedInboxTeamId: true,
          },
          compute(item) {
            if (item.assignedUserId) {
              return `u_${item.assignedUserId}`
            }

            if (item.assignedInboxTeamId) {
              return `t_${item.assignedUserId}`
            }

            return null
          },
        },
      },
      attachment: {
        url: {
          needs: { originPath: true },
          compute(attachment) {
            return new URL(attachment.originPath, env.NEXT_PUBLIC_ASSET_URL)
          },
        },
      },
    },
  })

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

export { Prisma } from "./generated/prisma/client"
export * from "./generated/prisma/enums"
