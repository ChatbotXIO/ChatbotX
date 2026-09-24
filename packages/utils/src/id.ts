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

const readProcessEnv = (): Record<string, string | undefined> =>
  typeof process === "undefined" ? {} : (process.env ?? {})

/** Source of randomness in [0, 1); injectable so tests are deterministic. */
export type RandomSource = () => number

/**
 * The place id every process used before per-process ids existed. The random
 * fallback never draws it, so during a rolling deploy a new process can never
 * share a place with a still-running old one.
 */
const LEGACY_PLACE_ID = 0

const randomIntBetween = (
  random: RandomSource,
  minInclusive: number,
  maxInclusive: number,
): number =>
  minInclusive + Math.floor(random() * (maxInclusive - minInclusive + 1))

const parseNonNegativeInt = (raw: string | undefined): number | undefined =>
  raw !== undefined && PLACE_ID_ENV_REGEX.test(raw) ? Number(raw) : undefined

/**
 * Pick the 4-bit place id that distinguishes this process from every other
 * one minting ids against the same database.
 *
 * `SNOWFLAKE_PLACE_ID` plus `SNOWFLAKE_PLACE_ID_OFFSET` (default 0) wins when
 * the sum is within 0–15. The offset exists for orchestrators whose per-task
 * number restarts at 1 for every service (Docker Swarm `{{.Task.Slot}}`): give
 * each service its own offset and the replicas never overlap. Otherwise a
 * random slot in 1–15 is drawn at startup so replicas that share one image
 * do not all land on the same value.
 */
export const resolveSnowflakePlaceId = (
  env: Record<string, string | undefined> = readProcessEnv(),
  random: RandomSource = Math.random,
): number => {
  const configured = parseNonNegativeInt(env.SNOWFLAKE_PLACE_ID)
  const offset = parseNonNegativeInt(env.SNOWFLAKE_PLACE_ID_OFFSET ?? "0")
  if (configured !== undefined && offset !== undefined) {
    const placeId = configured + offset
    if (placeId <= SNOWFLAKE_PLACE_ID_MAX) {
      return placeId
    }
  }
  return randomIntBetween(random, LEGACY_PLACE_ID + 1, SNOWFLAKE_PLACE_ID_MAX)
}

/**
 * Snowflake generator with two defences against cross-process collisions that
 * the previous fixed `place_id: 0` / sequence-from-0 setup lacked:
 * - `placeId` is per process, so two processes in the same millisecond differ.
 * - each new millisecond starts the sequence at a random offset, so even two
 *   processes that share a place id only collide with probability 1/1024 per
 *   simultaneous millisecond instead of certainty.
 *
 * Time is a logical clock: it never runs behind the last id issued (a wall
 * clock stepping backwards keeps counting in the last slot), and exhausting
 * the 1024 sequence values in one millisecond advances it by one instead of
 * busy-waiting, so `generate()` never blocks the event loop.
 */
export const createSnowflakeGenerator = ({
  placeId,
  random = Math.random,
}: {
  placeId: number
  random?: RandomSource
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

  // The sequence never wraps: once `start + issued` would leave the field,
  // the logical clock moves on. Ids therefore stay strictly increasing within
  // a process, which the old generator guaranteed and message ordering (index
  // `createdAt desc, id desc`) relies on for rows sharing a createdAt.
  const nextTimestamp = (): number => {
    const wallClock = Math.max(Date.now() - SNOWFLAKE_EPOCH_MS, lastTimestamp)
    const isSlotExhausted =
      wallClock === lastTimestamp &&
      sequenceStart + issuedInTimestamp >= SEQUENCE_SPACE
    return isSlotExhausted ? lastTimestamp + 1 : wallClock
  }

  const generate = (): string => {
    const now = nextTimestamp()
    if (now !== lastTimestamp) {
      lastTimestamp = now
      sequenceStart = randomIntBetween(random, 0, SEQUENCE_SPACE - 1)
      issuedInTimestamp = 0
    }
    const sequence = sequenceStart + issuedInTimestamp
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
