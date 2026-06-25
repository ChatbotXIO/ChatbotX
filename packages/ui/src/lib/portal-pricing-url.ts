/**
 * Builds the public, reseller-branded pricing page URL served from the
 * reseller's verified custom domain. The OSS builder proxies the domain-root
 * `/pricing` → portal `/portal/pricing`, so the customer-facing URL lives at
 * the domain root.
 *
 * Shared between the enterprise reseller portal (`apps/portal`) and the OSS
 * cloud-edition manage sidebar so both produce identical pricing links.
 */
export function buildResellerPricingUrl(domain: string): string {
  return `https://${domain}/portal/pricing`
}
