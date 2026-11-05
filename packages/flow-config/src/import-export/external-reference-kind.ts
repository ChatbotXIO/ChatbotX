/**
 * Marks a reference slot as a third-party id this product never owns, so no
 * policy, remap or warning ever applies to it. Its own module because both
 * `reference-fields.ts` and `contact-filter-references.ts` need it at load
 * time and neither may import the other first.
 */
export const EXTERNAL_REFERENCE_KIND = "external"
