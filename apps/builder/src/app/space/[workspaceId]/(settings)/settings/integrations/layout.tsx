import type { ReactNode } from "react"
import { IntegrationsAccordionShell } from "./integrations-accordion-shell"

type SettingIntegrationLayoutProps = {
  children?: ReactNode
}

// Server shell: rows come from INTEGRATION_SETTINGS_REGISTRY; the active
// provider's page renders as {children} inside its accordion panel. Visiting
// /settings/integrations executes zero provider pages (index) or exactly one
// (open panel) — previously all 18 parallel-route slots ran server-side on
// every visit.
export default function SettingIntegrationLayout({
  children,
}: SettingIntegrationLayoutProps) {
  return <IntegrationsAccordionShell>{children}</IntegrationsAccordionShell>
}
