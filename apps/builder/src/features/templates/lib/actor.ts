import type { TemplateActor } from "@chatbotx.io/business"

export type MemberPermissions = Extract<
  TemplateActor,
  { kind: "member" }
>["permissions"]

export const memberActor = (permissions: MemberPermissions): TemplateActor => ({
  kind: "member",
  permissions,
})
