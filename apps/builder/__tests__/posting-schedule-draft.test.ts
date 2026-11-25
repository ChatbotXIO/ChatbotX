import { emptyPostingSlots } from "@chatbotx.io/utils/posting-slots"
import { describe, expect, test } from "vitest"
import {
  addSlotTime,
  copyDayTo,
  hasPostingTimes,
  removeSlotTime,
  setDayEnabled,
  slotsKey,
} from "@/features/publish-destinations/lib/posting-schedule-draft"
import {
  collectFreeSlotPages,
  mergeSlots,
  slotDestinationIds,
} from "@/features/social-posts/lib/calendar-free-slots"

const dayOf = (slots: ReturnType<typeof emptyPostingSlots>, weekday: number) =>
  slots.find((day) => day.weekday === weekday)

describe("posting schedule draft", () => {
  test("adding a time sorts it, drops repeats and switches the day on", () => {
    let slots = emptyPostingSlots()
    slots = addSlotTime(slots, 1, "18:30")
    slots = addSlotTime(slots, 1, "09:00")
    slots = addSlotTime(slots, 1, "09:00")
    expect(dayOf(slots, 1)).toEqual({
      enabled: true,
      times: ["09:00", "18:30"],
      weekday: 1,
    })
    expect(hasPostingTimes(slots)).toBe(true)
  })

  test("a malformed time or a full day changes nothing", () => {
    const slots = emptyPostingSlots()
    expect(slotsKey(addSlotTime(slots, 2, "25:00"))).toBe(slotsKey(slots))
    expect(slotsKey(addSlotTime(slots, 2, "9:00"))).toBe(slotsKey(slots))
    let full = slots
    for (let hour = 0; hour < 12; hour++) {
      full = addSlotTime(full, 2, `${String(hour).padStart(2, "0")}:00`)
    }
    expect(dayOf(full, 2)?.times).toHaveLength(10)
  })

  test("removing a time and switching a day off keep the rest", () => {
    let slots = addSlotTime(
      addSlotTime(emptyPostingSlots(), 3, "08:00"),
      3,
      "20:00",
    )
    slots = removeSlotTime(slots, 3, "08:00")
    slots = setDayEnabled(slots, 3, false)
    expect(dayOf(slots, 3)).toEqual({
      enabled: false,
      times: ["20:00"],
      weekday: 3,
    })
    expect(hasPostingTimes(slots)).toBe(false)
  })

  test("copy gives the target days the source's state and times", () => {
    let slots = addSlotTime(emptyPostingSlots(), 1, "09:00")
    slots = copyDayTo(slots, 1, [2, 3, 1])
    expect(dayOf(slots, 2)).toEqual({
      enabled: true,
      times: ["09:00"],
      weekday: 2,
    })
    expect(dayOf(slots, 4)?.times).toEqual([])
  })

  test("a draft equal to the saved schedule is not dirty", () => {
    const saved = addSlotTime(emptyPostingSlots(), 5, "10:00")
    expect(slotsKey([...saved].reverse())).toBe(slotsKey(saved))
  })
})

describe("calendar free slots", () => {
  const options = [
    { id: "a", provider: "facebook" },
    { id: "b", provider: "instagram" },
    { id: "c", provider: "facebook" },
  ]

  test("the picked destination wins, then the network's, then the only one", () => {
    expect(
      slotDestinationIds(options, { destinationId: "b", provider: "facebook" }),
    ).toEqual(["b"])
    expect(
      slotDestinationIds(options, {
        destinationId: null,
        provider: "facebook",
      }),
    ).toEqual(["a", "c"])
    expect(
      slotDestinationIds(options, { destinationId: null, provider: null }),
    ).toEqual([])
    expect(
      slotDestinationIds([{ id: "z", provider: "threads" }], {
        destinationId: null,
        provider: null,
      }),
    ).toEqual(["z"])
  })

  test("merging keeps one marker per instant, in order", () => {
    const early = new Date("2026-12-01T01:00:00Z")
    const late = new Date("2026-12-01T09:00:00Z")
    expect(
      mergeSlots([[late, early], [new Date(early.getTime())]]).map((d) =>
        d.toISOString(),
      ),
    ).toEqual([early.toISOString(), late.toISOString()])
  })
})

describe("collectFreeSlotPages", () => {
  const at = (day: number) => new Date(Date.UTC(2026, 0, day))
  const from = at(1)
  const pageOf = (days: number[]) => ({
    items: days.map(at),
    timezone: "UTC",
  })

  test("pages with the last time as the cursor until a time reaches the period end", async () => {
    const afters: Date[] = []
    const pages = [pageOf([2, 3]), pageOf([4, 9])]
    const result = await collectFreeSlotPages({
      fetchPage: (after) => {
        afters.push(after)
        return Promise.resolve(pages[afters.length - 1] ?? pageOf([]))
      },
      from,
      limit: 2,
      until: at(8),
    })

    expect(afters).toEqual([from, at(3)])
    expect(result.items.map((d) => d.getUTCDate())).toEqual([2, 3, 4, 9])
    expect(result.isTruncated).toBe(false)
  })

  test("stops after the request budget and reports the cut", async () => {
    let calls = 0
    const result = await collectFreeSlotPages({
      fetchPage: () => {
        calls += 1
        return Promise.resolve(pageOf([calls * 2, calls * 2 + 1]))
      },
      from,
      limit: 2,
      maxRequests: 3,
      until: at(30),
    })

    expect(calls).toBe(3)
    expect(result.isTruncated).toBe(true)
  })

  test("a short page means there are no more times and is not a cut", async () => {
    const result = await collectFreeSlotPages({
      fetchPage: () => Promise.resolve(pageOf([2])),
      from,
      limit: 50,
      until: at(30),
    })

    expect(result.isTruncated).toBe(false)
    expect(result.items).toHaveLength(1)
  })
})
