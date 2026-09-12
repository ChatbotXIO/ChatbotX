import { describe, expect, test } from "vitest"
import {
  createSpreadsheetPublicRequest,
  updateSpreadsheetPublicRequest,
} from "@/features/spreadsheets/schema/public"

// The public `POST`/`PUT /v1/spreadsheets` endpoints validate the URL with the
// same schema the builder form uses, and the stored value is later rendered as
// a bare href — so the schema, not a substring test, is the boundary that has
// to reject a non-https, non-docs.google.com link.
const rejected = [
  [
    "a javascript: scheme",
    "javascript:fetch(1)//docs.google.com/spreadsheets/d/REALID/",
  ],
  ["a data: scheme", "data:text/html,docs.google.com/spreadsheets/d/AAA/"],
  [
    "a path marker on a foreign host",
    "https://evil.com/docs.google.com/spreadsheets/d/AAA/",
  ],
  [
    "a lookalike subdomain",
    "https://docs.google.com.evil.com/spreadsheets/d/AAA/",
  ],
  ["plain http", "http://docs.google.com/spreadsheets/d/AAA/edit"],
  [
    "the right host but the wrong product",
    "https://docs.google.com/document/d/AAA/edit",
  ],
] as const

const accepted = [
  ["a standard share link", "https://docs.google.com/spreadsheets/d/GOOD/edit"],
  [
    "an account-prefixed link",
    "https://docs.google.com/spreadsheets/u/0/d/GOOD/edit",
  ],
  [
    "a link carrying a gid fragment",
    "https://docs.google.com/spreadsheets/d/GOOD/edit#gid=0",
  ],
] as const

describe("createSpreadsheetRequest.url", () => {
  test.each(rejected)("rejects %s", (_label, url) => {
    expect(
      createSpreadsheetPublicRequest.safeParse({ name: "Sales", url }).success,
    ).toBe(false)
  })

  test.each(accepted)("accepts %s", (_label, url) => {
    expect(
      createSpreadsheetPublicRequest.safeParse({ name: "Sales", url }).success,
    ).toBe(true)
  })
})

describe("updateSpreadsheetPublicRequest.url", () => {
  test.each(rejected)("rejects %s", (_label, url) => {
    expect(
      updateSpreadsheetPublicRequest.safeParse({
        id: "1",
        name: "Sales",
        url,
      }).success,
    ).toBe(false)
  })

  test.each(accepted)("accepts %s", (_label, url) => {
    expect(
      updateSpreadsheetPublicRequest.safeParse({
        id: "1",
        name: "Sales",
        url,
      }).success,
    ).toBe(true)
  })
})
