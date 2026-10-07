import { z } from "zod"
import {
  compileNoulInstructions,
  type DecisionProfileContract,
  type DecisionProviderContract,
  type DecisionResult,
  decisionResultSchema,
} from "./contracts"

/** Compiles profile-domain storage into the minimal Jev wire representation. */
export const compileDecisionProfileRequest = (
  contract: DecisionProfileContract,
): { questions: Record<string, object> } => {
  const question = contract.questions[0]
  if (!question) {
    throw new Error("Decision Profile has no result question")
  }
  if (question.type === "choice") {
    return {
      questions: {
        result: {
          criteria: Object.fromEntries(
            question.options.map((option) => [
              option.value,
              option.description,
            ]),
          ),
          instructions: question.instructions,
          type: question.type,
        },
      },
    }
  }
  if (question.type === "score") {
    return {
      questions: {
        result: {
          criteria: question.levels.map((level) => level.description),
          instructions: question.instructions,
          type: question.type,
        },
      },
    }
  }
  return {
    questions: {
      result: {
        instructions: compileNoulInstructions(question),
        type: question.type,
      },
    },
  }
}

const nativeAnswerSchema = z.discriminatedUnion("type", [
  z
    .object({
      confidence: z.number().min(0).max(1).optional(),
      name: z.string(),
      probabilities: z.record(z.string(), z.number().min(0).max(1)).optional(),
      selectedId: z.string(),
      type: z.literal("choice"),
    })
    .strict(),
  z
    .object({
      confidence: z.number().min(0).max(1).optional(),
      name: z.string(),
      score: z.number().finite(),
      type: z.literal("score"),
    })
    .strict(),
  z
    .object({
      confidence: z.number().min(0).max(1).optional(),
      name: z.string(),
      probability: z.number().min(0).max(1),
      type: z.literal("noul"),
    })
    .strict(),
])

const nativeResultSchema = z
  .object({
    answers: z.array(nativeAnswerSchema),
    providerModel: z.string().min(1),
  })
  .strict()

const providerAnswerSchema = z.discriminatedUnion("type", [
  z
    .object({
      choice: z.string(),
      confidence: z.number().optional(),
      probabilities: z.record(z.string(), z.number()).optional(),
      type: z.literal("choice"),
    })
    .passthrough(),
  z
    .object({
      confidence: z.number().optional(),
      score: z.number(),
      type: z.literal("score"),
    })
    .passthrough(),
  z
    .object({
      confidence: z.number().optional(),
      noul: z.number(),
      type: z.literal("noul"),
    })
    .passthrough(),
])

const normalizeProviderAnswers = (answers: unknown): unknown => {
  const parsed = z.record(z.string(), providerAnswerSchema).safeParse(answers)
  if (!parsed.success) {
    return answers
  }

  return Object.fromEntries(
    Object.entries(parsed.data).map(([key, answer]) => {
      if (answer.type === "choice") {
        return [
          key,
          {
            choice: answer.choice,
            confidence: answer.confidence,
            probabilities: answer.probabilities,
            type: answer.type,
          },
        ]
      }
      if (answer.type === "score") {
        return [
          key,
          {
            confidence: answer.confidence,
            score: answer.score,
            type: answer.type,
          },
        ]
      }

      return [
        key,
        {
          confidence: answer.confidence,
          noul: answer.noul,
          type: answer.type,
        },
      ]
    }),
  )
}

const normalizeNativeAnswer = (answer: z.infer<typeof nativeAnswerSchema>) => {
  if (answer.type === "choice") {
    return {
      choice: answer.selectedId,
      confidence: answer.confidence,
      probabilities: answer.probabilities,
      type: answer.type,
    }
  }
  if (answer.type === "score") {
    return {
      confidence: answer.confidence,
      score: answer.score,
      type: answer.type,
    }
  }

  return {
    confidence: answer.confidence,
    noul: answer.probability,
    type: answer.type,
  }
}

const validateAgainstContract = (
  result: DecisionResult,
  contract: DecisionProviderContract,
): DecisionResult => {
  const questionByKey = new Map(
    contract.questions.map((question) => [question.key, question] as const),
  )
  const answerKeys = Object.keys(result.answers)
  if (
    answerKeys.length !== questionByKey.size ||
    answerKeys.some((key) => !questionByKey.has(key))
  ) {
    throw new Error("Decision provider returned a missing or unknown answer")
  }
  const answers: DecisionResult["answers"] = {}
  for (const [key, answer] of Object.entries(result.answers)) {
    const question = questionByKey.get(key)
    if (!question || question.type !== answer.type) {
      throw new Error("Decision provider answer type does not match Profile")
    }
    if (
      answer.type === "choice" &&
      question.type === "choice" &&
      !question.options.some((option) => option.value === answer.choice)
    ) {
      throw new Error("Decision provider returned an invalid choice")
    }
    if (answer.type === "score" && question.type === "score") {
      const normalizedScore = answer.score + 1
      const min = question.levels[0]?.value
      const max = question.levels.at(-1)?.value
      if (
        min === undefined ||
        max === undefined ||
        normalizedScore < min ||
        normalizedScore > max
      ) {
        throw new Error(
          "Decision provider returned a score outside the Profile range",
        )
      }
      answers[key] = { ...answer, score: normalizedScore }
      continue
    }
    answers[key] = answer
  }
  return { ...result, answers }
}

export const normalizeDecisionProviderResponse = (input: {
  contract: DecisionProviderContract
  raw: unknown
}): DecisionResult => {
  const rawResult = z
    .object({
      answers: z.unknown(),
      model: z.string().min(1).optional(),
    })
    .passthrough()
    .safeParse(input.raw)
  const normalized = rawResult.success
    ? decisionResultSchema.safeParse({
        answers: normalizeProviderAnswers(rawResult.data.answers),
        model: rawResult.data.model,
      })
    : { success: false as const }
  if (normalized.success) {
    return validateAgainstContract(normalized.data, input.contract)
  }
  const native = nativeResultSchema.parse(input.raw)
  const result = decisionResultSchema.parse({
    answers: Object.fromEntries(
      native.answers.map((answer) => [
        answer.name,
        normalizeNativeAnswer(answer),
      ]),
    ),
    model: native.providerModel,
  })
  return validateAgainstContract(result, input.contract)
}
