import { afterEach, describe, expect, it, vi } from "vitest"
import {
  durationLabel,
  getPace,
  getPalette,
  isCountRow,
  lineMetric,
  paceNote,
  progressBar,
  providerMetaText,
  resetDuration,
  resetText,
  rightAlign,
  timeAgo,
  type Theme,
  type UsageLine,
} from "./limits.ts"

describe("limits helpers", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("maps V2 theme tokens to the palette", () => {
    const color = (name: string) => ({ name })
    const theme = {
      background: { raised: { max: color("track") } },
      text: {
        base: color("text"),
        muted: color("muted"),
        feedback: { warning: { base: color("warning") }, success: { base: color("ok") }, error: { base: color("critical") } },
      },
      hue: { interactive: { 200: color("dark"), 300: color("light") } },
    } as unknown as Theme
    const palette = getPalette(theme)

    expect(palette.subtle).toBe(theme.background.raised.max)
    expect(palette.text).toBe(theme.text.base)
    expect(palette.muted).toBe(theme.text.muted)
    expect(palette.accent).toBe(theme.hue.interactive[200])
    expect(getPalette(theme, "light").accent).toBe(theme.hue.interactive[300])
    expect(palette.warning).toBe(theme.text.feedback.warning.base)
    expect(palette.ok).toBe(theme.text.feedback.success.base)
    expect(palette.critical).toBe(theme.text.feedback.error.base)
  })

  it("formats ages and reset durations", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-08T20:00:00Z"))

    expect(timeAgo("2026-04-08T19:55:00Z")).toBe("5m")
    expect(durationLabel(4 * 60 * 60 * 1000)).toBe("4h")
    expect(resetDuration({
      label: "Session",
      type: "progress",
      used: 10,
      limit: 100,
      resetsAt: "2026-04-09T00:00:00Z",
    })).toBe("4h")
    expect(providerMetaText({
      displayName: "Claude",
      plan: "Max 5x",
      fetchedAt: "2026-04-08T19:55:00Z",
    })).toBe("Max 5x · 5m")
  })

  it("formats percent and count metrics cleanly", () => {
    expect(lineMetric({
      label: "Weekly",
      type: "progress",
      used: 24,
      limit: 100,
    })).toBe(" 24%")

    expect(lineMetric({
      label: "Credits",
      type: "progress",
      used: 1000,
      limit: 1000,
      format: { kind: "count", suffix: "credits" },
    })).toBe("1000/1000")

    expect(lineMetric({
      label: "Spend",
      type: "progress",
      used: 4,
      limit: 10,
      format: { kind: "count", suffix: "credits" },
    })).toBe("4/10 credits")
  })

  it("draws progress bars with half-cell precision", () => {
    const line = (used: number, limit = 100) => ({ label: "Weekly", type: "progress", used, limit })

    expect(progressBar(line(0))).toEqual({ filled: "", empty: "━━━━━━━━━━" })
    expect(progressBar(line(30))).toEqual({ filled: "━━━", empty: "━━━━━━━" })
    expect(progressBar(line(34))).toEqual({ filled: "━━━╸", empty: "━━━━━━" })
    expect(progressBar(line(100))).toEqual({ filled: "━━━━━━━━━━", empty: "" })
    expect(progressBar(line(250))).toEqual({ filled: "━━━━━━━━━━", empty: "" })
    expect(progressBar(line(5, 0))).toEqual({ filled: "", empty: "━━━━━━━━━━" })
    expect(progressBar(line(1, 2), 4)).toEqual({ filled: "━━", empty: "━━" })
  })

  it("grades burn rate like OpenUsage and projects usage at reset", () => {
    const DAY = 24 * 60 * 60 * 1000
    const now = Date.parse("2026-10-13T00:00:00Z")
    const line = (used: number, extra: Partial<UsageLine> = {}): UsageLine => ({
      label: "Weekly",
      type: "progress",
      used,
      limit: 100,
      resetsAt: new Date(now + 5 * DAY).toISOString(),
      periodDurationMs: 10 * DAY,
      ...extra,
    })

    expect(getPace(line(40), now)).toEqual({ severity: "ok", spent: false, projectedPercent: 80 })
    expect(getPace(line(46), now)).toEqual({ severity: "warning", spent: false, projectedPercent: 92, sparePercent: 8 })
    expect(getPace(line(60), now)).toMatchObject({ severity: "critical", projectedPercent: 120 })
    expect(getPace(line(60), now).runsOutInMs).toBeCloseTo((40 / 12) * DAY)
    expect(getPace(line(50), now)).toMatchObject({ severity: "critical", projectedPercent: 100 })
    expect(getPace(line(50), now).runsOutInMs).toBeUndefined()

    expect(paceNote(getPace(line(40), now))).toBe("~80% used at reset")
    expect(paceNote(getPace(line(46), now))).toBe("~92% used at reset · ~8% spare")
    expect(paceNote(getPace(line(60), now))).toBe("~120% used at reset · limit in 3d")
  })

  it("falls back to level bands when pace cannot be projected", () => {
    const DAY = 24 * 60 * 60 * 1000
    const now = Date.parse("2026-10-13T00:00:00Z")
    const bare = (used: number): UsageLine => ({ label: "Credits", type: "progress", used, limit: 100 })

    expect(getPace(bare(50), now)).toEqual({ severity: "ok", spent: false })
    expect(getPace(bare(85), now).severity).toBe("warning")
    expect(getPace(bare(90), now).severity).toBe("critical")
    expect(paceNote(getPace(bare(85), now))).toBe("")

    const young = { ...bare(2), resetsAt: new Date(now + 10 * DAY - 1000).toISOString(), periodDurationMs: 10 * DAY }
    expect(getPace(young, now)).toEqual({ severity: "ok", spent: false })

    const nearEmpty = { ...bare(4), resetsAt: new Date(now + 9.9 * DAY).toISOString(), periodDurationMs: 10 * DAY }
    expect(getPace(nearEmpty, now)).toEqual({ severity: "ok", spent: false })
    expect(getPace({ ...bare(0), resetsAt: new Date(now + 5 * DAY).toISOString(), periodDurationMs: 10 * DAY }, now))
      .toEqual({ severity: "ok", spent: false })
    expect(getPace({ ...bare(1), limit: 0 }, now)).toEqual({ severity: "ok", spent: false })
  })

  it("treats a spent limit as critical regardless of pace", () => {
    const spent = getPace({ label: "Credits", type: "progress", used: 100, limit: 100 })
    expect(spent).toEqual({ severity: "critical", spent: true })
    expect(paceNote(spent)).toBe("Limit reached")
    expect(getPace({ label: "Spend", type: "progress", used: 10, limit: 10, format: { kind: "count" } }).spent).toBe(true)
    expect(getPace({ label: "Weekly", type: "progress", used: 99.7, limit: 100 }).spent).toBe(true)
  })

  it("handles reset text and alignment helpers", () => {
    expect(isCountRow({
      label: "Credits",
      type: "progress",
      used: 1,
      limit: 1,
      format: { kind: "count" },
    })).toBe(true)

    expect(resetText({
      label: "Weekly",
      type: "progress",
      used: 24,
      limit: 100,
      periodDurationMs: 7 * 24 * 60 * 60 * 1000,
    })).toBe("~7d")

    expect(rightAlign("4h", 7)).toBe("     4h")
  })
})
