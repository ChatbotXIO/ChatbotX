export const decisionProviderKinds = [
  "typesafe",
  "openrouterDecision",
  "systemOneCompatible",
] as const

export type DecisionProviderKind = (typeof decisionProviderKinds)[number]

export const decisionProviderLabelKeyByKind = {
  openrouterDecision: "decision.providers.openrouterDecision",
  systemOneCompatible: "decision.providers.systemOneCompatible",
  typesafe: "decision.providers.typesafe",
} as const satisfies Record<DecisionProviderKind, string>
