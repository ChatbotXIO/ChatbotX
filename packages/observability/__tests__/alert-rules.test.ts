import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../..")
const INBOUND_VOLUME_DROP_OPERANDS =
  '(sum(rate(chatbotx_messages_total{direction="in"}[10m])) or vector(0)) < 0.3 * (sum(rate(chatbotx_messages_total{direction="in"}[10m] offset 1w)) or vector(0))'
const PROMETHEUS_INBOUND_VOLUME_DROP_EXPRESSION = INBOUND_VOLUME_DROP_OPERANDS
const GRAFANA_INBOUND_VOLUME_DROP_EXPRESSION =
  INBOUND_VOLUME_DROP_OPERANDS.replace(" < ", " < bool ")
const EXPRESSION_LINE_PATTERN = /^\s*expr: (.+)$/m

const prometheusRules = readFileSync(
  resolve(REPOSITORY_ROOT, "ops/observability/prometheus/alerts.yml"),
  "utf8",
)
const grafanaRules = readFileSync(
  resolve(
    REPOSITORY_ROOT,
    "ops/observability/grafana/provisioning/alerting/messaging-rules.yml",
  ),
  "utf8",
)

const expressionAfter = (source: string, ruleIdentifier: string): string => {
  const ruleSection = source.split(ruleIdentifier, 2)[1]
  const expression = ruleSection?.match(EXPRESSION_LINE_PATTERN)?.[1]
  if (!expression) {
    throw new Error(`Missing expression for ${ruleIdentifier}`)
  }
  return expression
}

describe("inbound message volume drop alert", () => {
  test("zero-fills absent current and historical message samples", () => {
    const expression = expressionAfter(
      prometheusRules,
      "alert: InboundMessageVolumeDrop",
    )

    expect(expression).toBe(PROMETHEUS_INBOUND_VOLUME_DROP_EXPRESSION)
  })

  test("returns a boolean signal for Grafana's threshold condition", () => {
    const prometheusExpression = expressionAfter(
      prometheusRules,
      "alert: InboundMessageVolumeDrop",
    )
    const grafanaExpression = expressionAfter(
      grafanaRules,
      "uid: chatbotx-inbound-volume-drop",
    )

    expect(grafanaExpression).toBe(GRAFANA_INBOUND_VOLUME_DROP_EXPRESSION)
    expect(grafanaExpression.replace(" < bool ", " < ")).toBe(
      prometheusExpression,
    )
  })
})
