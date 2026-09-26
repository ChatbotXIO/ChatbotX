import { z } from "zod"

export const publicContactIdentifier = z
  .string()
  .min(1)
  .describe(
    "Contact identifier with a required prefix: id:123, email:ada@example.com, or phone:+841234567890. Bare ids, emails, phone numbers, and display names are invalid. For a name, search contacts.list and use id:<returned id>.",
  )
