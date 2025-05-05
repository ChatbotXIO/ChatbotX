import * as util from "util"
import { PrismaClient } from "../generated/client"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
const enableDebug = process.env.PRISMA_DEBUG === "true"

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient().$extends({
    query: enableDebug
      ? {
          $allModels: {
            async $allOperations({ operation, model, args, query }) {
              const start = performance.now()
              const result = await query(args)
              const end = performance.now()
              const time = end - start
              console.log(
                util.inspect(
                  { model, operation, args, time },
                  { showHidden: false, depth: null, colors: true },
                ),
              )
              return result
            },
          },
        }
      : undefined,
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
