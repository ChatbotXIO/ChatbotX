import { z } from "zod"
import { mailchimpDefaultFn, mailchimpSchema } from "./mailchimp"
import { StepType } from "./step-action"

export const mailchimpAddMemberStepSchema = mailchimpSchema.extend({
  stepType: z.literal(StepType.mailchimpAddMember),
  emailField: z.string().min(1),
  doubleOptIn: z.boolean(),
  tags: z.array(z.string()),
  status: z.enum(["subscribed", "unsubscribed", "cleaned", "transactional"]),
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
