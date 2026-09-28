---
name: multi-model-brainstorming
description: >-
  Run structured architectural or product brainstorming with OMP's plan and
  advisor roles. Use when comparing approaches, stress-testing a proposal, or
  choosing under explicit trade-offs. Distinguishes primary/fallback routing
  from simultaneous multi-model review.
---

# Multi-Model Brainstorming

Use this skill for a decision that benefits from independent proposal and
critique: architecture, refactor strategy, product design, reliability trade-off,
or incident response options.

## Runtime model roles

- `/plan` enters OMP plan mode and uses the configured `plan` role.
- A role fallback runs **only** after its primary model fails, times out, or is
  unavailable. It is not a second participant in the discussion.
- The advisor runtime passively reviews each turn. Start OMP with `--advisor`
  if it is not already enabled by configuration.
- To get genuine cross-model review, configure `plan` and `advisor` to use
  different model providers. Do not claim two models participated when a
  fallback was merely configured.

## Invocation

Start a session with advisor review when needed:

```bash
omp --advisor
```

Then submit this command in the session:

```text
/plan Brainstorm <decision>. Compare 3 viable approaches against <criteria>.
For each: assumptions, benefits, costs, failure modes, implementation outline,
and rejection conditions. Treat advisor feedback as adversarial review. End with
a recommendation, confidence, and the smallest validation that could overturn it.
```

If a session is already running with the advisor runtime enabled, submit only the
`/plan` prompt.

## Decision protocol

1. State the decision in one sentence. List constraints, non-goals, and the
   criteria used to choose.
2. Produce two or three meaningfully different options. Do not invent variants
   that differ only in naming or implementation detail.
3. For every option, identify its strongest use case, cost, irreversible
   consequence, operational risk, and falsifying evidence.
4. Treat advisor notes as counterarguments, not as the decision. Resolve each
   material objection with evidence, a mitigation, or an explicit accepted risk.
5. Recommend one option. Name the trade-off that made it win and the exact
   next validation step.

## Required output

```markdown
## Decision
<recommended option and why>

## Options
| Option | Benefits | Costs / risks | Best when |
| --- | --- | --- | --- |

## Advisor challenges
- <challenge> — <resolution or accepted risk>

## Assumptions
- <assumption and how to verify it>

## Next validation
<smallest concrete experiment, prototype, measurement, or code search>
```

## Guardrails

- Do not use a fallback chain as evidence of multi-model consensus.
- Keep alternatives implementable within the stated constraints.
- Separate facts from assumptions; label uncertainty rather than filling gaps.
- Prefer a reversible experiment when the decision lacks decisive evidence.
- Ask follow-up questions only when missing information could change the winner.
