// In-process stub for the /api/freeswitch/xml responder, used
// only by the container integration test. It answers exactly the
// three mod_xml_curl bindings — `configuration` (sofia.conf gateways),
// `directory` (SIP users) and `dialplan` — for one fixed test
// integration/gateway and one fixed agent user, plus supports removing the
// gateway on demand so test (b) can prove the rescan/gone cycle.
//
// Field names parsed from the POST body (`section`, `tag_name`,
// `key_name`, `key_value`, `hostname`, plus channel vars) are exactly
// what mod_xml_curl posts — see the responder (`renderFreeswitchXml`) and
// mod_xml_curl.c's documented form fields (`hostname` = `switchname`).
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"

export type StubTestFixture = {
  readonly gatewayName: string
  readonly businessNumber: string
  readonly agentUsername: string
  readonly agentPassword: string
  readonly sipDomain: string
}

export const TEST_FIXTURE: StubTestFixture = {
  gatewayName: "wa-test",
  businessNumber: "15550001111",
  agentUsername: "ag-1-1",
  agentPassword: "test-agent-password",
  sipDomain: "fs.test.localhost",
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function notFoundXml(): string {
  return `<document type="freeswitch/xml"><section name="result"><result status="not found"/></section></document>`
}

function parseFormBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body)
  const result: Record<string, string> = {}
  for (const [key, value] of params.entries()) {
    result[key] = value
  }
  return result
}

/** In-memory gateway registry mutated by the test to prove the
 * rescan-driven add/remove cycle. */
export class XmlCurlStubServer {
  private server: Server | undefined
  private gatewayPresent = true
  readonly fixture: StubTestFixture

  constructor(fixture: StubTestFixture = TEST_FIXTURE) {
    this.fixture = fixture
  }

  setGatewayPresent(present: boolean): void {
    this.gatewayPresent = present
  }

  async listen(port: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server = createServer((req, res) => this.handle(req, res))
      this.server.once("error", reject)
      this.server.listen(port, "0.0.0.0", () => resolve())
    })
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve())
    })
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8")
      const params = parseFormBody(body)
      const xml = this.render(params)
      res.writeHead(200, {
        "Content-Type": "text/xml",
        "Cache-Control": "no-store",
      })
      res.end(xml)
    })
  }

  private render(params: Record<string, string>): string {
    const section = params.section
    if (section === "configuration") {
      return this.renderConfiguration()
    }
    if (section === "directory") {
      return this.renderDirectory(params)
    }
    if (section === "dialplan") {
      return this.renderDialplan(params)
    }
    return notFoundXml()
  }

  private renderConfiguration(): string {
    const gateways = this.gatewayPresent
      ? `<gateway name="${escapeXml(this.fixture.gatewayName)}">
            <param name="proxy" value="wa.meta.vc:5061;transport=tls"/>
            <param name="realm" value="wa.meta.vc"/>
            <param name="username" value="${escapeXml(this.fixture.businessNumber)}"/>
            <param name="password" value="stub-password"/>
            <param name="from-user" value="${escapeXml(this.fixture.businessNumber)}"/>
            <param name="from-domain" value="${escapeXml(this.fixture.sipDomain)}"/>
            <param name="register" value="false"/>
            <param name="caller-id-in-from" value="false"/>
          </gateway>`
      : ""

    return `<document type="freeswitch/xml">
      <section name="configuration">
        <configuration name="sofia.conf" description="sofia Endpoint">
          <profiles>
            <profile name="whatsapp">
              <gateways>
                ${gateways}
              </gateways>
            </profile>
          </profiles>
        </configuration>
      </section>
    </document>`
  }

  private renderDirectory(params: Record<string, string>): string {
    const userId = params.user ?? params.key_value ?? ""
    if (userId === this.fixture.businessNumber) {
      return this.userDirectoryXml(this.fixture.businessNumber, "stub-password")
    }
    if (userId === this.fixture.agentUsername) {
      return this.userDirectoryXml(
        this.fixture.agentUsername,
        this.fixture.agentPassword,
      )
    }
    return notFoundXml()
  }

  private userDirectoryXml(id: string, password: string): string {
    return `<document type="freeswitch/xml">
      <section name="directory">
        <domain name="${escapeXml(this.fixture.sipDomain)}">
          <user id="${escapeXml(id)}">
            <params>
              <param name="password" value="${escapeXml(password)}"/>
            </params>
            <variables>
              <variable name="cbx_integration_id" value="1"/>
              <variable name="cbx_workspace_id" value="1"/>
            </variables>
          </user>
        </domain>
      </section>
    </document>`
  }

  private renderDialplan(params: Record<string, string>): string {
    const context = params.Caller_Context ?? params["Caller-Context"] ?? ""
    const destination =
      params.Caller_Destination_Number ??
      params["Caller-Destination-Number"] ??
      ""

    if (
      context === "whatsapp_inbound" &&
      destination === this.fixture.businessNumber
    ) {
      return this.inboundDialplanXml()
    }
    if (context === "agents") {
      return this.outboundDialplanXml()
    }
    return notFoundXml()
  }

  private inboundDialplanXml(): string {
    // Mirrors the responder's inbound extension: export the correlation vars,
    // emit `CUSTOM cbx::call`, then bridge to the fixed test agent.
    return `<document type="freeswitch/xml">
      <section name="dialplan">
        <context name="whatsapp_inbound">
          <extension name="chatbotx-inbound-test">
            <condition field="destination_number" expression="^${this.fixture.businessNumber}$">
              <action application="set" data="cbx_wacid=${"$"}{sip_h_x-wa-meta-wacid}"/>
              <action application="set" data="cbx_user_id=${"$"}{sip_h_x-wa-meta-user-id}"/>
              <action application="export" data="cbx_integration_id=1"/>
              <action application="export" data="cbx_workspace_id=1"/>
              <action application="export" data="cbx_root_uuid=${"$"}{uuid}"/>
              <action application="set" data="rtp_secure_media=mandatory:AES_CM_128_HMAC_SHA1_80"/>
              <action application="answer" data=""/>
              <action application="event" data="Event-Name=CUSTOM,Event-Subclass=cbx::call,cbx_phase=inbound"/>
              <action application="bridge" data="user/${escapeXml(this.fixture.agentUsername)}@${escapeXml(this.fixture.sipDomain)}"/>
            </condition>
          </extension>
        </context>
      </section>
    </document>`
  }

  private outboundDialplanXml(): string {
    return `<document type="freeswitch/xml">
      <section name="dialplan">
        <context name="agents">
          <extension name="chatbotx-outbound-test">
            <condition field="destination_number" expression="^\\+?\\d{8,15}$">
              <action application="export" data="cbx_integration_id=1"/>
              <action application="export" data="cbx_workspace_id=1"/>
              <action application="export" data="cbx_root_uuid=${"$"}{uuid}"/>
              <action application="export" data="cbx_attempt_id=stub-attempt"/>
              <action application="event" data="Event-Name=CUSTOM,Event-Subclass=cbx::call,cbx_phase=outbound"/>
              <action application="set" data="rtp_secure_media=mandatory:AES_CM_128_HMAC_SHA1_80"/>
              <action application="export" data="sip_h_X-CBX-Attempt"/>
              <action application="set" data="sip_invite_req_uri=sip:${"$"}{destination_number}@wa.meta.vc;transport=tls"/>
              <action application="bridge" data="sofia/gateway/${escapeXml(this.fixture.gatewayName)}/${"$"}{destination_number}"/>
            </condition>
          </extension>
        </context>
      </section>
    </document>`
  }
}
