# Session tokens plugin

Adds the `/tokens` slash command to the OpenCode TUI. It opens a popup showing
the user/assistant message count for the currently open session and the token
breakdown and total for that session's family, including subagents.

The breakdown shows input, output, cache input (read), cache output (write),
and reasoning usage from assistant and compaction records. The total adds these
categories. OpenCode discovers this plugin from the global
`~/.config/opencode/plugins/` directory, so no additional plugin config entry
is needed. Use `/reload` in OpenCode after installing or editing it.
