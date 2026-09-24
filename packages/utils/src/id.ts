import { Snowflake } from "uuniq"

/**
 * Numeric snowflake layout shared with the legacy uuniq generator (and with the
 * coexist historical-id factory): `timestamp(53) << 14 | placeId(4) << 10 |
 * sequence(10)`, milliseconds since 2004-02-01. Keeping the layout means every
 * id already stored stays decodable by {@link resolveId} and sorts correctly
 * next to new ids.
 */
const SNOWFLAKE_EPOCH_ISO = new Date("2004-02-01").toISOString()
const SNOWFLAKE_EPOCH_MS = Date.parse(SNOWFLAKE_EPOCH_ISO)
// Field widths expressed as multipliers so the packing below stays plain
// arithmetic: the fields never overlap, so `a * scale + b` equals `a << n | b`.
const SEQUENCE_SPACE = 1024 // 2^10 sequence values per millisecond
const PLACE_ID_SPACE = 16 // 2^4 place ids
const TIMESTAMP_SCALE = BigInt(SEQUENCE_SPACE * PLACE_ID_SPACE) // << 14
const PLACE_ID_SCALE = BigInt(SEQUENCE_SPACE) // << 10
export const SNOWFLAKE_PLACE_ID_MAX = PLACE_ID_SPACE - 1
const PLACE_ID_ENV_REGEX = /^\d+$/

/** Decoder only — kept on uuniq so `resolveId` output stays byte-identical. */
const NumericSnowflakeIDs = new Snowflake({ epoch: SNOWFLAKE_EPOCH_ISO })

export const SymbolicSnowflakeIDs = new Snowflake({
  epoch: SNOWFLAKE_EPOCH_ISO,
  format: "symbolic",
  place_id: 1,
})

export interface SnowflakeGenerator {
  generate: () => string
  readonly placeId: number
}

const randomInt = (upperExclusive: number): number =>
  Math.floor(Math.random() * upperExclusive)

const readProcessEnv = (): Record<string, string | undefined> =>
  typeof process === "undefined" ? {} : (process.env ?? {})

/**
 * Pick the 4-bit place id that distinguishes this process from every other
 * one minting ids against the same database. `SNOWFLAKE_PLACE_ID` (0–15) wins
 * when set; otherwise a random slot is drawn at startup so replicas that share
 * one image do not all land on the same value.
 */
export const resolveSnowflakePlaceId = (
  env: Record<string, string | undefined> = readProcessEnv(),
): number => {
  const raw = env.SNOWFLAKE_PLACE_ID
  if (raw !== undefined && PLACE_ID_ENV_REGEX.test(raw)) {
    const parsed = Number(raw)
    if (parsed <= SNOWFLAKE_PLACE_ID_MAX) {
      return parsed
    }
  }
  return randomInt(SNOWFLAKE_PLACE_ID_MAX + 1)
}

const waitForNextMillisecond = (lastTimestamp: number): number => {
  let now = Date.now() - SNOWFLAKE_EPOCH_MS
  while (now <= lastTimestamp) {
    now = Date.now() - SNOWFLAKE_EPOCH_MS
  }
  return now
}

/**
 * Snowflake generator with two defences against cross-process collisions that
 * the previous fixed `place_id: 0` / sequence-from-0 setup lacked:
 * - `placeId` is per process, so two processes in the same millisecond differ.
 * - each new millisecond starts the sequence at a random offset, so even two
 *   processes that share a place id only collide with probability 1/1024 per
 *   simultaneous millisecond instead of certainty.
 */
export const createSnowflakeGenerator = ({
  placeId,
}: {
  placeId: number
}): SnowflakeGenerator => {
  if (
    !Number.isInteger(placeId) ||
    placeId < 0 ||
    placeId > SNOWFLAKE_PLACE_ID_MAX
  ) {
    throw new Error(
      `Snowflake place id must be an integer between 0 and ${SNOWFLAKE_PLACE_ID_MAX}, received ${String(placeId)}`,
    )
  }
  const placeField = BigInt(placeId) * PLACE_ID_SCALE

  // Generator state is inherently sequential; it never escapes this closure.
  let lastTimestamp = -1
  let sequenceStart = 0
  let issuedInTimestamp = 0

  const generate = (): string => {
    // Clamp so a clock stepping backwards keeps counting in the last slot
    // instead of re-entering an earlier millisecond with a fresh offset.
    let now = Math.max(Date.now() - SNOWFLAKE_EPOCH_MS, lastTimestamp)
    if (now === lastTimestamp && issuedInTimestamp >= SEQUENCE_SPACE) {
      now = waitForNextMillisecond(lastTimestamp)
    }
    if (now !== lastTimestamp) {
      lastTimestamp = now
      sequenceStart = randomInt(SEQUENCE_SPACE)
      issuedInTimestamp = 0
    }
    const sequence = (sequenceStart + issuedInTimestamp) % SEQUENCE_SPACE
    issuedInTimestamp += 1
    return (
      BigInt(now) * TIMESTAMP_SCALE +
      placeField +
      BigInt(sequence)
    ).toString()
  }

  return { placeId, generate }
}

const processGenerator = createSnowflakeGenerator({
  placeId: resolveSnowflakePlaceId(),
})

export const createId = (): string => processGenerator.generate()

export const resolveId = (id: string) => NumericSnowflakeIDs.resolve(id)

export const parseBigIntId = (
  id: string | undefined | null,
): string | undefined => {
  if (!id) {
    return
  }
  try {
    return BigInt(id).toString()
  } catch {
    return
  }
}

export const getIdFromParams = <
  T extends Record<string, string | undefined | null>,
>(
  params: T,
  fieldName: keyof T,
) => params[fieldName]

const NUMERIC_ID_REGEX = /^\d+$/
export const isNumericId = (value: string): boolean =>
  NUMERIC_ID_REGEX.test(value)
