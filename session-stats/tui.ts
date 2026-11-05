import { Plugin } from "@opencode/plugin/tui"
import { chatMessageCount, tokenUsageTotals, totalTokenCount } from "./src/stats.ts"

async function showSessionUsage(context: Plugin.Context): Promise<void> {
  const route = context.ui.router.current()
  if (route.type !== "session") {
    context.ui.toast.show({
      title: "Tokens",
      message: "Open a session to see its message and token usage.",
      variant: "warning",
    })
    return
  }

  try {
    const sessionID = route.sessionID
    const rootID = context.data.session.root(sessionID)
    const sessionIDs = [...new Set([rootID, ...context.data.session.family(rootID)])]

    await Promise.all(sessionIDs.map((id) => context.data.session.message.sync(id)))

    const currentMessages = context.data.session.message.list(sessionID) ?? []
    const allFamilyMessages = sessionIDs.flatMap((id) => context.data.session.message.list(id) ?? [])
    const messages = chatMessageCount(currentMessages)
    const usage = tokenUsageTotals(allFamilyMessages)
    const total = totalTokenCount(usage)

    await context.ui.dialog.alert({
      title: "Session usage",
      message: [
        `Messages in this session: ${messages.toLocaleString()}`,
        `Input: ${usage.input.toLocaleString()}`,
        `Output: ${usage.output.toLocaleString()}`,
        `Cache input (read): ${usage.cacheInput.toLocaleString()}`,
        `Cache output (write): ${usage.cacheOutput.toLocaleString()}`,
        `Reasoning: ${usage.reasoning.toLocaleString()}`,
        `Total tokens (including subagents): ${total.toLocaleString()}`,
      ].join("\n"),
    })
  } catch (error) {
    context.ui.toast.show({
      title: "Tokens",
      message: error instanceof Error ? error.message : String(error),
      variant: "error",
    })
  }
}

export default Plugin.define({
  id: "session-tokens",
  setup(context) {
    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "session-tokens.show",
          title: "Show session token usage",
          group: "Session",
          palette: true,
          bind: false,
          slash: { name: "tokens" },
          run: () => showSessionUsage(context),
        },
      ],
    }))
  },
})
