import { beforeEach, describe, expect, test } from "vitest"
import { useWhatsappCallStore } from "../src/features/integration-whatsapp/calling/softphone/call-store"

describe("useWhatsappCallStore", () => {
  beforeEach(() => {
    useWhatsappCallStore.setState({
      incoming: {},
      active: null,
      outgoing: null,
    })
  })

  test("a raw SIP ring is keyed by rootUuid", () => {
    useWhatsappCallStore.getState().addIncomingRing("root-1")
    expect(useWhatsappCallStore.getState().incoming["root-1"]).toEqual({
      rootUuid: "root-1",
    })
  })

  test("realtime enrichment merges onto the same rootUuid key, arriving after the ring", () => {
    useWhatsappCallStore.getState().addIncomingRing("root-1")
    useWhatsappCallStore.getState().enrichIncoming({
      rootUuid: "root-1",
      callId: "call-1",
      correlationId: "wacid-1",
      contactName: "Ada Lovelace",
    })

    expect(useWhatsappCallStore.getState().incoming["root-1"]).toEqual({
      rootUuid: "root-1",
      callId: "call-1",
      correlationId: "wacid-1",
      contactName: "Ada Lovelace",
    })
  })

  test("realtime enrichment arriving before the SIP ring still creates the entry", () => {
    useWhatsappCallStore.getState().enrichIncoming({
      rootUuid: "root-2",
      callId: "call-2",
      correlationId: "wacid-2",
    })
    expect(useWhatsappCallStore.getState().incoming["root-2"]).toEqual(
      expect.objectContaining({ rootUuid: "root-2", callId: "call-2" }),
    )
  })

  test("handleCallEnded by callId clears the matching incoming ring", () => {
    useWhatsappCallStore
      .getState()
      .enrichIncoming({ rootUuid: "root-1", callId: "call-1" })
    useWhatsappCallStore.getState().handleCallEnded({ callId: "call-1" })
    expect(useWhatsappCallStore.getState().incoming).toEqual({})
  })

  test("handleCallEnded by rootUuid clears the matching active call", () => {
    useWhatsappCallStore.getState().setActiveCall({
      rootUuid: "root-1",
      callId: "call-1",
      startedAt: Date.now(),
    })
    useWhatsappCallStore.getState().handleCallEnded({ rootUuid: "root-1" })
    expect(useWhatsappCallStore.getState().active).toBeNull()
  })

  test("handleCallEnded leaves an unrelated active call untouched", () => {
    useWhatsappCallStore.getState().setActiveCall({
      rootUuid: "root-1",
      callId: "call-1",
      startedAt: Date.now(),
    })
    useWhatsappCallStore.getState().handleCallEnded({ callId: "call-999" })
    expect(useWhatsappCallStore.getState().active?.callId).toBe("call-1")
  })

  test("handleCallEnded by callId clears a matching outgoing call", () => {
    useWhatsappCallStore
      .getState()
      .setOutgoingCall({ attemptId: "att-1", callId: "call-1" })
    useWhatsappCallStore.getState().handleCallEnded({ callId: "call-1" })
    expect(useWhatsappCallStore.getState().outgoing).toBeNull()
  })

  test("dismissIncoming removes one ring without affecting others", () => {
    useWhatsappCallStore.getState().addIncomingRing("root-1")
    useWhatsappCallStore.getState().addIncomingRing("root-2")
    useWhatsappCallStore.getState().dismissIncoming("root-1")
    expect(Object.keys(useWhatsappCallStore.getState().incoming)).toEqual([
      "root-2",
    ])
  })
})
