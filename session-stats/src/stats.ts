export type UsageMessage = {
  type: string
  tokens?: {
    input?: number
    output?: number
    reasoning?: number
    cache?: {
      read?: number
      write?: number
    }
  }
}

export type TokenUsageTotals = {
  input: number
  output: number
  reasoning: number
  cacheInput: number
  cacheOutput: number
}

export function chatMessageCount(messages: readonly UsageMessage[]): number {
  return messages.filter((message) => message.type === "user" || message.type === "assistant").length
}

function valueOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0
}

export function tokenUsageTotals(messages: readonly UsageMessage[]): TokenUsageTotals {
  return messages.reduce<TokenUsageTotals>((total, message) => {
    const usage = message.tokens
    if (!usage) return total

    return {
      input: total.input + valueOrZero(usage.input),
      output: total.output + valueOrZero(usage.output),
      reasoning: total.reasoning + valueOrZero(usage.reasoning),
      cacheInput: total.cacheInput + valueOrZero(usage.cache?.read),
      cacheOutput: total.cacheOutput + valueOrZero(usage.cache?.write),
    }
  }, { input: 0, output: 0, reasoning: 0, cacheInput: 0, cacheOutput: 0 })
}

export function totalTokenCount(usage: TokenUsageTotals): number {
  return usage.input + usage.output + usage.reasoning + usage.cacheInput + usage.cacheOutput
}
