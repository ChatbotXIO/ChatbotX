import { getAllCountries } from "countries-and-timezones"

/**
 * ISO 3166-1 alpha-2 country options for the targeting `geo_locations.countries`
 * multi-select — never free text, so every value sent to Meta is a valid
 * country code. Reuses the same `countries-and-timezones` source as the
 * workspace `targetCountry` picker (`features/workspaces/schema/types.ts`).
 */
export const messagingAdCountryOptions = Object.values(getAllCountries())
  .map((country) => ({ value: country.id, label: country.name }))
  .sort((a, b) => a.label.localeCompare(b.label))
