import { PrismaClient } from "../generated/client"
// import { PrismaPg } from '@prisma/adapter-pg'

// const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
const enableDebug = process.env.PRISMA_DEBUG === "true"

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    // adapter,
    log: enableDebug ? ["query"] : [],
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
                .filter((v) => !!v)
                .join(" ")
            }

            return contact.phoneNumber || "-"
          },
        },
      },
      attachment: {
        url: {
          needs: { originPath: true },
          compute(attachment) {
            return new URL(attachment.originPath, process.env.ASSET_URL)
          },
        },
      },
    },
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

export * from "../generated/client"
