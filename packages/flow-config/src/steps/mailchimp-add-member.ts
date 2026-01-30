import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { mailchimpDefaultFn, mailchimpSchema } from "./mailchimp"
import { StepType } from "./step-action"

export const mailchimpAddMemberStepSchema = mailchimpSchema.extend({
  id: z.cuid2(),
  stepType: z.literal(StepType.mailchimpAddMember),
  emailField: z.string().min(1),
  doubleOptIn: z.boolean(),
  tags: z.array(z.string()),
  status: z.enum([
    "subscribed",
    "unsubscribed",
    "cleaned",
    "transactional",
    "pending",
  ]),
  mergeFields: z.array(
    z.object({
      chatbotField: z.string(),
      mailchimpTag: z.string().min(1),
    }),
  ),
})

export type MailchimpAddMemberSchema = z.infer<
  typeof mailchimpAddMemberStepSchema
>

export const mailchimpAddMemberDefaultFn = (): MailchimpAddMemberSchema => ({
  ...mailchimpDefaultFn(),
  id: createId(),
  stepType: StepType.mailchimpAddMember,
  emailField: "email",
  doubleOptIn: false,
  tags: [],
  status: "subscribed",
  mergeFields: [
    { chatbotField: "", mailchimpTag: "Address" },
    { chatbotField: "", mailchimpTag: "Birthday" },
    { chatbotField: "", mailchimpTag: "Company" },
    { chatbotField: "", mailchimpTag: "Phone Number" },
  ],
})
