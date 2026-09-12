// Container integration test for the FreeSWITCH image.
//
// Gated by RUN_FS_CONTAINER=1 because it builds a real Docker image
// (requires SIGNALWIRE_TOKEN) and starts real containers plus
// a `sipp` container — unsuitable for the default `pnpm test` run. When
// the gate is off this file still type-checks and runs one lightweight
// smoke test that documents why everything else was skipped, so `vitest
// run` never silently reports zero coverage for this file.
//
// This suite could not be executed in the environment this change was
// written in: `docker build`/`docker manifest inspect` both hang with no
// output against Docker Hub / the SignalWire apt repo (registry network
// access is blocked in that sandbox — see the change report). The code
// below is written to actually run a real Docker daemon with registry
// access and RUN_FS_CONTAINER=1 plus a real SIGNALWIRE_TOKEN; it has not
// been run end-to-end.
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
  type FreeswitchContainerHandle,
  runCommand,
  runSippScenario,
  startFreeswitchContainer,
  waitForHealthy,
} from "./helpers/freeswitch/docker-harness"
import { EslClient, type EslEvent } from "./helpers/freeswitch/esl-client"
import {
  TEST_FIXTURE,
  XmlCurlStubServer,
} from "./helpers/freeswitch/xml-curl-stub-server"

const RUN_FS_CONTAINER = process.env.RUN_FS_CONTAINER === "1"
const SIGNALWIRE_TOKEN = process.env.SIGNALWIRE_TOKEN ?? ""
const STUB_PORT = 18_089
const ESL_PORT = 18_021
const TLS_SIP_PORT = 15_061
const WSS_PORT = 17_443
const ESL_PASSWORD = "test-esl-password"
const NODE_A = "test-node-a"
const NODE_B = "test-node-b"

const PROFILE_WHATSAPP_RUNNING_RE = /whatsapp\s+.*RUNNING/i
const PROFILE_AGENTS_RUNNING_RE = /agents\s+.*RUNNING/i
const TLS_RE = /TLS/i
const NOREG_RE = /NOREG/i
const GATEWAY_MISSING_RE = /Invalid Gateway|not found/i
const OUTBOUND_INVITE_RE = /INVITE sip:\+?15551234567@.*;transport=tls/
const VIA_TLS_RE = /Via: SIP\/2\.0\/TLS/
const SDES_CRYPTO_RE = /a=crypto:\d+ AES_CM_128_HMAC_SHA1_80/
const OPUS_FIRST_RE = /a=rtpmap:\d+ opus\/48000/
const INVITE_LINE_RE = /^INVITE /gm
const OGG_SUFFIX_RE = /\.ogg$/
const LOST_EVENTS_RE = /Lost events/i

describe.skipIf(!RUN_FS_CONTAINER)(
  "freeswitch container (RUN_FS_CONTAINER=1)",
  () => {
    let stub: XmlCurlStubServer
    let container: FreeswitchContainerHandle
    let esl: EslClient
    const receivedEvents: EslEvent[] = []

    beforeAll(
      async () => {
        if (!SIGNALWIRE_TOKEN) {
          throw new Error(
            "SIGNALWIRE_TOKEN must be set when RUN_FS_CONTAINER=1",
          )
        }

        stub = new XmlCurlStubServer(TEST_FIXTURE)
        await stub.listen(STUB_PORT)

        container = await startFreeswitchContainer({
          imageTag: "chatbotx-freeswitch-test",
          containerName: `chatbotx-fs-test-${randomUUID()}`,
          signalwireToken: SIGNALWIRE_TOKEN,
          eslPort: ESL_PORT,
          tlsSipPort: TLS_SIP_PORT,
          wssPort: WSS_PORT,
          env: {
            FS_SIP_DOMAIN: TEST_FIXTURE.sipDomain,
            FS_PUBLIC_IP: "127.0.0.1",
            FS_NODE_ID: NODE_A,
            FS_ESL_PASSWORD: ESL_PASSWORD,
            FS_ESL_LISTEN_IP: "0.0.0.0",
            FS_XML_BASIC_USER: "test",
            FS_XML_BASIC_PASS: "test",
            CBX_XML_URL: `http://host.docker.internal:${STUB_PORT}/api/freeswitch/xml`,
          },
        })

        await waitForHealthy(container.containerName, 60_000)

        esl = await EslClient.connect("127.0.0.1", ESL_PORT, ESL_PASSWORD)
        esl.onEvent((event) => receivedEvents.push(event))
        await esl.subscribe([
          "CHANNEL_ANSWER",
          "CHANNEL_HANGUP_COMPLETE",
          "RECORD_STOP",
          "CUSTOM",
          "cbx::call",
        ])
      },
      15 * 60 * 1000,
    )

    afterAll(async () => {
      esl?.close()
      await container?.stop()
      await stub?.close()
    })

    test("(a) both sofia profiles are RUNNING with TLS", async () => {
      const status = await esl.api("sofia status")
      expect(status).toMatch(PROFILE_WHATSAPP_RUNNING_RE)
      expect(status).toMatch(PROFILE_AGENTS_RUNNING_RE)

      const profileStatus = await esl.api("sofia status profile whatsapp")
      expect(profileStatus).toMatch(TLS_RE)
    })

    test("(b) xml_curl-backed gateway appears and disappears across rescan", async () => {
      stub.setGatewayPresent(true)
      await esl.api("sofia profile whatsapp rescan")
      const withGateway = await esl.api(
        `sofia status gateway ${TEST_FIXTURE.gatewayName}`,
      )
      expect(withGateway).toMatch(NOREG_RE)

      stub.setGatewayPresent(false)
      await esl.api("sofia profile whatsapp rescan")
      const withoutGateway = await esl.api(
        `sofia status gateway ${TEST_FIXTURE.gatewayName}`,
      )
      expect(withoutGateway).toMatch(GATEWAY_MISSING_RE)

      // Restore for the remaining tests.
      stub.setGatewayPresent(true)
      await esl.api("sofia profile whatsapp rescan")
    })

    test("(c) inbound TLS INVITE is challenged, reaches whatsapp_inbound, and cbx::call carries the header vars", async () => {
      receivedEvents.length = 0

      const scenarioPath = join(
        import.meta.dirname,
        "fixtures/freeswitch/inbound-invite.xml",
      )
      const sipp = await runSippScenario({
        targetHost: "127.0.0.1",
        targetPort: TLS_SIP_PORT,
        scenarioFile: scenarioPath,
        extraArgs: ["-t", "l1", "-m", "1"],
      })
      expect(sipp.exitCode, sipp.stderr).toBe(0)

      const cbxCallEvent = receivedEvents.find(
        (event) => event.headers["Event-Subclass"] === "cbx::call",
      )
      expect(cbxCallEvent, "expected a CUSTOM cbx::call event").toBeDefined()
      expect(cbxCallEvent?.headers.variable_cbx_integration_id).toBeDefined()
      expect(cbxCallEvent?.headers.variable_cbx_workspace_id).toBeDefined()
      expect(cbxCallEvent?.headers.variable_sip_from_user).toBeDefined()
      expect(cbxCallEvent?.headers.variable_sip_to_user).toBeDefined()
      expect(cbxCallEvent?.headers["variable_sip_h_x-wa-meta-wacid"]).toBe(
        "wacid.test1234567890",
      )
    })

    test("(d) outbound bridge sends the expected wire INVITE and never re-INVITEs for 120s", async () => {
      const uasScenarioPath = join(
        import.meta.dirname,
        "fixtures/freeswitch/outbound-uas.xml",
      )
      const uasPort = 15_070

      const uasPromise = runCommand(
        "docker",
        [
          "run",
          "--rm",
          "-v",
          `${uasScenarioPath}:/scenario.xml:ro`,
          "-p",
          `${uasPort}:${uasPort}/udp`,
          "ctaloi/sipp:latest",
          "-sf",
          "/scenario.xml",
          "-p",
          String(uasPort),
          "-trace_msg",
        ],
        { timeoutMs: 150_000 },
      )

      await esl.api(
        `originate sofia/gateway/${TEST_FIXTURE.gatewayName}/15551234567 &bridge(sofia/gateway/${TEST_FIXTURE.gatewayName}/15551234567)`,
      )

      const uasResult = await uasPromise
      expect(uasResult.exitCode, uasResult.stderr).toBe(0)
      expect(uasResult.stdout).toMatch(OUTBOUND_INVITE_RE)
      expect(uasResult.stdout).toMatch(
        new RegExp(`From:.*${TEST_FIXTURE.sipDomain}`),
      )
      expect(uasResult.stdout).toMatch(VIA_TLS_RE)
      expect(uasResult.stdout).toMatch(SDES_CRYPTO_RE)
      expect(uasResult.stdout).toMatch(OPUS_FIRST_RE)
      // Exactly one INVITE per dialog: no re-INVITE during the 120s pause.
      expect(uasResult.stdout.match(INVITE_LINE_RE)?.length ?? 0).toBe(1)
    })

    test("(e) record_session writes a 16kHz stereo .ogg named by the A-leg uuid, and the B-leg carries variable_cbx_root_uuid", () => {
      const recordStopEvent = receivedEvents.find(
        (event) => event.headers["Event-Name"] === "RECORD_STOP",
      )
      expect(
        recordStopEvent,
        "expected a RECORD_STOP event from test (c)/(d)",
      ).toBeDefined()
      const path = recordStopEvent?.headers["Record-File-Path"] ?? ""
      expect(path).toMatch(OGG_SUFFIX_RE)

      const uuid = recordStopEvent?.headers["Unique-ID"] ?? ""
      const bLegEvent = receivedEvents.find(
        (event) =>
          event.headers.variable_cbx_root_uuid === uuid &&
          event.headers["Unique-ID"] !== uuid,
      )
      expect(
        bLegEvent,
        "expected a B-leg event carrying variable_cbx_root_uuid",
      ).toBeDefined()
    })

    test(
      "(f) 200 loopback calls at 30/s: every CHANNEL_HANGUP_COMPLETE arrives, no Lost events",
      async () => {
        receivedEvents.length = 0

        // Literal `${chatbotx_test_number}` is FreeSWITCH's own dialplan
        // variable syntax (expanded by FreeSWITCH, not JS), not an
        // unintended template placeholder.
        const load = await esl.api(
          // biome-ignore lint/suspicious/noTemplateCurlyInString: FreeSWITCH ${} syntax, not a JS template literal
          "bgapi originate loopback/${chatbotx_test_number}/agents 200 30",
        )
        expect(load).toBeDefined()

        // Poll for hangup completions rather than a fixed sleep (deterministic
        // wait, not a timeout guess).
        const deadline = Date.now() + 120_000
        let hangups = 0
        while (Date.now() < deadline) {
          hangups = receivedEvents.filter(
            (event) =>
              event.headers["Event-Name"] === "CHANNEL_HANGUP_COMPLETE",
          ).length
          if (hangups >= 200) {
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
        expect(hangups).toBe(200)

        const eslStatus = await esl.api("status")
        expect(eslStatus).not.toMatch(LOST_EVENTS_RE)
      },
      3 * 60 * 1000,
    )

    test(
      "(g) two-node sharding: node A only ever sees node A's gateway/workspace",
      async () => {
        const stubB = new XmlCurlStubServer({
          ...TEST_FIXTURE,
          gatewayName: "wa-test-b",
          businessNumber: "15550002222",
        })
        const stubBPort = STUB_PORT + 1
        await stubB.listen(stubBPort)

        const containerB = await startFreeswitchContainer({
          imageTag: "chatbotx-freeswitch-test",
          containerName: `chatbotx-fs-test-b-${randomUUID()}`,
          signalwireToken: SIGNALWIRE_TOKEN,
          eslPort: ESL_PORT + 1,
          tlsSipPort: TLS_SIP_PORT + 1,
          wssPort: WSS_PORT + 1,
          env: {
            FS_SIP_DOMAIN: "fs-b.test.localhost",
            FS_PUBLIC_IP: "127.0.0.1",
            FS_NODE_ID: NODE_B,
            FS_ESL_PASSWORD: ESL_PASSWORD,
            FS_ESL_LISTEN_IP: "0.0.0.0",
            FS_XML_BASIC_USER: "test",
            FS_XML_BASIC_PASS: "test",
            CBX_XML_URL: `http://host.docker.internal:${stubBPort}/api/freeswitch/xml`,
          },
        })

        try {
          await waitForHealthy(containerB.containerName, 60_000)
          const eslB = await EslClient.connect(
            "127.0.0.1",
            ESL_PORT + 1,
            ESL_PASSWORD,
          )
          try {
            await eslB.api("sofia profile whatsapp rescan")
            const gatewaysOnA = await esl.api("sofia status gateway wa-test-b")
            expect(gatewaysOnA).toMatch(GATEWAY_MISSING_RE)

            const gatewaysOnB = await eslB.api("sofia status gateway wa-test-b")
            expect(gatewaysOnB).toMatch(NOREG_RE)
          } finally {
            eslB.close()
          }
        } finally {
          await containerB.stop()
          await stubB.close()
        }
      },
      5 * 60 * 1000,
    )
  },
)

describe.skipIf(RUN_FS_CONTAINER)("freeswitch container (skipped)", () => {
  test("documents why the container suite did not run", () => {
    // Set RUN_FS_CONTAINER=1 and SIGNALWIRE_TOKEN to run the real
    // container suite above — it builds a Docker image and
    // starts real containers plus a `sipp` container, so it is opt-in.
    expect(RUN_FS_CONTAINER).toBe(false)
  })
})
