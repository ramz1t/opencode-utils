import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

describe("tui module", () => {
  it("defines a V2 plugin that appends the usage section to the sidebar", async () => {
    const source = await readFile("src/tui.tsx", "utf8")

    expect(source).toContain('from "@opencode/plugin/tui"')
    expect(source).toContain("Plugin.define(")
    expect(source).toContain('append: "sidebar.content"')
    expect(source).toContain("USAGE LIMITS")
    expect(source).toContain("ProviderLimits")
  })

  it("exposes only a TUI entrypoint", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"))

    expect(pkg.exports).toEqual({ "./tui": "./tui.ts" })
    expect(await readFile("tui.ts", "utf8")).toContain("./src/tui.tsx")
  })
})
