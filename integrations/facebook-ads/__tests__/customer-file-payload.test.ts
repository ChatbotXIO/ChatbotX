import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  buildCustomerFilePayload,
  mapCustomerFileHeaders,
} from "../src/customer-file"

const NOW = new Date("2026-10-04T00:00:00.000Z")
const TEMPLATE = join(
  import.meta.dirname,
  "../../../apps/builder/public/templates/marketing-messages-audience.csv",
)

// Known SHA-256 hex vectors.
const H = {
  email: "23b9cb38c8e9c75a466a349eec16aff2c3eabc707cf57432a872aab7e532d069", // elizabetho@fb.com
  phone: "c7e1a5948418c64b472abbe6a7b443ec83c4e31573874d600de828f89dd71339", // 16505615622
  fn: "b54f08623ae4039f55bcecba4961037fb4513d2ba9cb2b0667c5db970ac94911", // elizabeth
  ct: "0007a3d64c01e23d5075203c5977c14e4f7e01a3fc570686fcc50b5e1dd42685", // menlopark
  st: "6959097001d10501ac7d54c0bdb8db61420f658f2922cc26e46d536119a31126", // ca
  zip: "295d89c851231ecef8c875c88077773f861c5adb0b0e239933dd5241d230dbd9", // 94046
  country: "79adb2a2fce5c6ba215fe5f27f532d4e7edbac4b6a5e09e1ef3a08084a904621", // us
  doby: "a48622b535728587fd351763d1296c7ec9cb5bc6743d5f22b011d5b5c3ef688f", // 1968
  dobm: "4a44dc15364204a80fe80e9039455cc1608281820fe2b24f1e5233ade6af1dd5", // 10
  dobd: "6f4b6612125fb3a0daecd2799dfd6c9c299424fd920f9b308110a2c1fbd8f443", // 21
  gen: "252f10c83610ebca1a059c0bae8255eba2f95be4d1d7bcfa89d7248a82d9f111", // f
}

function mapOrThrow(headers: string[]) {
  const result = mapCustomerFileHeaders(headers)
  if (!result.ok) {
    throw new Error(result.reason)
  }
  return result.columns
}

describe("mapCustomerFileHeaders", () => {
  test("matches template names and aliases case/space/underscore-insensitively", () => {
    const columns = mapOrThrow([
      "E-mail",
      "Phone Number",
      "First_Name",
      "last name",
      "City",
      "State/Province",
      "ZIP/Postal Code",
      "Country",
      "Date of birth",
      "Year of birth",
      "Gender",
      "Mobile advertiser ID",
      "age",
    ])
    expect([...columns.entries()]).toEqual([
      ["EMAIL", 0],
      ["PHONE", 1],
      ["FN", 2],
      ["LN", 3],
      ["CT", 4],
      ["ST", 5],
      ["ZIP", 6],
      ["COUNTRY", 7],
      ["DOB", 8],
      ["DOBY", 9],
      ["GEN", 10],
      ["MADID", 11],
    ])
  })

  test("first duplicate column wins", () => {
    expect(mapOrThrow(["email", "Email"]).get("EMAIL")).toBe(0)
  })

  test("needs an email or phone column", () => {
    expect(mapCustomerFileHeaders(["fn", "ln", "uid"])).toEqual({
      ok: false,
      reason: "noIdentifier",
    })
  })
})

describe("buildCustomerFilePayload", () => {
  test("builds the canonical schema and hashes every value except MADID", () => {
    const columns = mapOrThrow([
      "email",
      "phone",
      "madid",
      "fn",
      "ln",
      "zip",
      "ct",
      "st",
      "country",
      "dob",
      "doby",
      "gen",
    ])
    const payload = buildCustomerFilePayload(
      [
        [
          "elizabetho@fb.com",
          "1-(650)-561-5622",
          "AECE52E7-03EE-455A-B3C4-E57283966239",
          "Elizabeth",
          "",
          "94046",
          "Menlo Park",
          "CA",
          "US",
          "10/21/68",
          "",
          "F",
        ],
      ],
      columns,
      NOW,
    )
    expect(payload.schema).toEqual([
      "EMAIL",
      "PHONE",
      "FN",
      "LN",
      "CT",
      "ST",
      "ZIP",
      "COUNTRY",
      "DOBY",
      "DOBM",
      "DOBD",
      "GEN",
      "MADID",
    ])
    expect(payload.data).toEqual([
      [
        H.email,
        H.phone,
        H.fn,
        "",
        H.ct,
        H.st,
        H.zip,
        H.country,
        H.doby,
        H.dobm,
        H.dobd,
        H.gen,
        "aece52e7-03ee-455a-b3c4-e57283966239",
      ],
    ])
    expect(payload.skipped).toBe(0)
  })

  test("an explicit year-of-birth column wins over the DOB year", () => {
    const columns = mapOrThrow(["email", "dob", "doby"])
    const payload = buildCustomerFilePayload(
      [["elizabetho@fb.com", "10/21/67", "1968"]],
      columns,
      NOW,
    )
    expect(payload.data[0]?.[1]).toBe(H.doby)
  })

  test("only sends keys present in the headers", () => {
    const payload = buildCustomerFilePayload(
      [["elizabetho@fb.com"]],
      mapOrThrow(["email"]),
      NOW,
    )
    expect(payload).toEqual({
      schema: ["EMAIL"],
      data: [[H.email]],
      skipped: 0,
    })
  })

  test("skips rows with neither a valid email nor a valid phone", () => {
    const payload = buildCustomerFilePayload(
      [
        ["not-an-email", "0912345678", "Ann"], // local phone, no country → invalid
        ["", "", "Bob"],
        ["elizabetho@fb.com", "", ""],
      ],
      mapOrThrow(["email", "phone", "fn"]),
      NOW,
    )
    expect(payload.skipped).toBe(2)
    expect(payload.data).toEqual([[H.email, "", ""]])
  })

  test("the shipped template produces 9 rows and the full schema", () => {
    const [headerLine, ...lines] = readFileSync(TEMPLATE, "utf8")
      .trim()
      .split("\n")
    // The template has no quoted cells, so a plain split is exact.
    const rows = lines.map((line) => line.split(","))
    const payload = buildCustomerFilePayload(
      rows,
      mapOrThrow((headerLine ?? "").split(",")),
      NOW,
    )
    expect(payload.skipped).toBe(0)
    expect(payload.data).toHaveLength(9)
    expect(payload.schema).toHaveLength(13)
    expect(payload.data[0]?.[0]).toBe(H.email)
    expect(payload.data[0]?.[1]).toBe(H.phone)
  })
})
