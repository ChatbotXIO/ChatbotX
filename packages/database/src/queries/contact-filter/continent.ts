import { countries } from "countries-list"
import { type AnyColumn, inArray, type SQL, sql } from "drizzle-orm"
import { operatorTypes } from "../../partials"
import { buildColumnWhere, buildRawColumnWhere } from "./predicates"
import type { ContactWhere } from "./types"

const UNKNOWN_CONTINENT_VALUE = "unknown"
const ACTIVE_CONTINENT_CODES = new Set(["AF", "AS", "EU", "NA", "OC", "SA"])

const countryCodesByContinent = Object.entries(countries).reduce<
  Map<string, string[]>
>((map, [countryCode, country]) => {
  if (!ACTIVE_CONTINENT_CODES.has(country.continent)) {
    return map
  }

  map.set(country.continent, [
    ...(map.get(country.continent) ?? []),
    countryCode,
  ])
  return map
}, new Map())

const mappedCountryCodes = [...countryCodesByContinent.values()].flat()

const toSelectedValues = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).filter(
    (item): item is string => typeof item === "string" && item !== "",
  )

const combineWithOr = (predicates: SQL[]): SQL | undefined => {
  if (predicates.length === 0) {
    return
  }

  return predicates
    .slice(1)
    .reduce(
      (combined, predicate) => sql`${combined} OR ${predicate}`,
      predicates[0],
    )
}

const buildSelectedContinentPredicate = (
  column: AnyColumn,
  values: string[],
): SQL | undefined => {
  const hasUnknown = values.includes(UNKNOWN_CONTINENT_VALUE)
  const countryCodes = [
    ...new Set(
      values.flatMap((value) => countryCodesByContinent.get(value) ?? []),
    ),
  ]
  const predicates: SQL[] = []

  if (countryCodes.length > 0) {
    predicates.push(
      sql`(${column} IS NOT NULL AND ${column} <> '' AND ${inArray(column, countryCodes)})`,
    )
  }

  if (hasUnknown) {
    predicates.push(
      sql`(${column} IS NULL OR ${column} = '' OR NOT (${inArray(column, mappedCountryCodes)}))`,
    )
  }

  return combineWithOr(predicates)
}

export function buildContinentWhere(
  operator: string,
  value: unknown,
): ContactWhere {
  if (operator === operatorTypes.enum.isEmpty) {
    return buildColumnWhere("country", operator, value)
  }

  if (
    !(operator === operatorTypes.enum.eq || operator === operatorTypes.enum.ne)
  ) {
    return {}
  }

  const values = toSelectedValues(value)
  return buildRawColumnWhere("country", (column) => {
    const selectedPredicate = buildSelectedContinentPredicate(column, values)
    if (!selectedPredicate) {
      return sql`FALSE`
    }

    return operator === operatorTypes.enum.eq
      ? selectedPredicate
      : sql`NOT (${selectedPredicate})`
  })
}
