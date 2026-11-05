import type { RGBA } from "@opentui/core"
import type { Plugin } from "@opencode/plugin/tui"

export type Theme = Plugin.Context["theme"]

export const USED_COLUMN_WIDTH = 5
export const RESET_COLUMN_WIDTH = 7
export const BAR_WIDTH = 10
export const REFRESH_INTERVAL_MS = 30_000

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const TWO_DAYS_MS = 2 * 24 * HOUR_MS

export interface Palette {
    subtle: RGBA
    text: RGBA
    muted: RGBA
    accent: RGBA
    warning: RGBA
    ok: RGBA
    critical: RGBA
}

export interface UsageLine {
    label: string
    type: string
    used: number
    limit: number
    format?: {
        kind?: string
        suffix?: string
    }
    resetsAt?: string | null
    periodDurationMs?: number | null
}

export interface ProviderUsage {
    displayName: string
    plan?: string
    fetchedAt: string
    lines?: UsageLine[]
}

export const getPalette = (theme: Theme, mode: "dark" | "light" = "dark"): Palette => ({
    subtle: theme.background.raised.max,
    text: theme.text.base,
    muted: theme.text.muted,
    accent: theme.hue.interactive[mode === "light" ? 300 : 200],
    warning: theme.text.feedback.warning.base,
    ok: theme.text.feedback.success.base,
    critical: theme.text.feedback.error.base,
})

export const timeAgo = (isoString: string) => {
    const elapsedMs = Date.now() - new Date(isoString).getTime()
    if (elapsedMs < MINUTE_MS) return "now"
    if (elapsedMs < HOUR_MS) return `${Math.floor(elapsedMs / MINUTE_MS)}m`
    if (elapsedMs < TWO_DAYS_MS) return `${Math.floor(elapsedMs / HOUR_MS)}h`
    return `${Math.floor(elapsedMs / (24 * HOUR_MS))}d`
}

export const durationLabel = (durationMs: number) => {
    if (durationMs < HOUR_MS) return `${Math.max(1, Math.floor(durationMs / MINUTE_MS))}m`
    if (durationMs < TWO_DAYS_MS) return `${Math.floor(durationMs / HOUR_MS)}h`
    return `${Math.floor(durationMs / (24 * HOUR_MS))}d`
}

export const resetDuration = (line: UsageLine) => {
    if (line.resetsAt) {
        const remainingMs = new Date(line.resetsAt).getTime() - Date.now()
        if (remainingMs <= 0) return "now"
        return durationLabel(remainingMs)
    }

    if (line.periodDurationMs && line.periodDurationMs > 0) {
        return `~${durationLabel(line.periodDurationMs)}`
    }

    return "--"
}

export const updatedText = (provider: ProviderUsage) => {
    const age = timeAgo(provider.fetchedAt)
    return age === "now" ? "just now" : age
}

export const providerMetaText = (provider: ProviderUsage) => {
    const updated = updatedText(provider)
    return provider.plan ? `${provider.plan} · ${updated}` : updated
}

export const resetText = (line: UsageLine) => {
    const duration = resetDuration(line)
    return duration === "--" ? "" : duration
}

export const lineMetric = (line: UsageLine) => {
    if (line.format?.kind === "count") {
        const suffix = line.format.suffix && line.label.toLowerCase() !== line.format.suffix.toLowerCase()
            ? ` ${line.format.suffix}`
            : ""
        return `${Math.round(line.used)}/${Math.round(line.limit)}${suffix}`
    }

    if (line.limit <= 0) return "  0%"
    const percent = Math.min(100, Math.max(0, Math.round((line.used / line.limit) * 100)))
    return `${percent.toString().padStart(3)}%`
}

export const isCountRow = (line: UsageLine) => line.format?.kind === "count"

export const usageRatio = (line: UsageLine) =>
    line.limit > 0 ? Math.min(1, Math.max(0, line.used / line.limit)) : 0

export type Severity = "ok" | "warning" | "critical"

export interface Pace {
    severity: Severity
    spent: boolean
    projectedPercent?: number
    sparePercent?: number
    runsOutInMs?: number
}

const levelSeverity = (line: UsageLine): Severity => {
    const percent = Math.round(usageRatio(line) * 100)
    if (percent >= 90) return "critical"
    if (percent >= 80) return "warning"
    return "ok"
}

/**
 * Burn-rate pacing, ported from OpenUsage (Pace.swift / WidgetData.meterState): projects usage at the
 * current rate to the end of the reset window and grades the result. Rows with no reset window, or too
 * early in one to project, fall back to level bands on the share already used.
 */
export const getPace = (line: UsageLine, now = Date.now()): Pace => {
    const { used, limit } = line
    if (!(limit > 0)) return { severity: "ok", spent: false }

    const remaining = isCountRow(line) ? limit - used : ((limit - used) / limit) * 100
    if (Math.round(remaining) <= 0) return { severity: "critical", spent: true }

    const level: Pace = { severity: levelSeverity(line), spent: false }
    const period = line.periodDurationMs ?? 0
    const resetsAt = line.resetsAt ? new Date(line.resetsAt).getTime() : NaN
    if (!(used > 0) || !(period > 0) || Number.isNaN(resetsAt)) return level

    const elapsed = now - (resetsAt - period)
    if (elapsed < Math.max(MINUTE_MS, period * 0.01) || now >= resetsAt) return level

    const projected = (used / elapsed) * period
    const projectedPercent = Math.round((projected / limit) * 100)
    const nearEmpty = used / limit < 0.05

    if (projected <= limit * 0.9) return { severity: "ok", spent: false, projectedPercent }

    if (projected <= limit) {
        if (nearEmpty) return level
        const sparePercent = Math.round((1 - projected / limit) * 100)
        if (sparePercent < 1) return { severity: "critical", spent: false, projectedPercent }
        return { severity: "warning", spent: false, projectedPercent, sparePercent }
    }

    if (nearEmpty) return level
    const runsOutInMs = ((limit - used) / (projected / period))
    return {
        severity: "critical",
        spent: false,
        projectedPercent,
        ...(runsOutInMs > 0 && runsOutInMs < resetsAt - now ? { runsOutInMs } : {}),
    }
}

export const paceNote = (pace: Pace) => {
    if (pace.spent) return "Limit reached"
    if (pace.projectedPercent === undefined) return ""
    const parts = [`~${pace.projectedPercent}% used at reset`]
    if (pace.runsOutInMs !== undefined) parts.push(`limit in ${durationLabel(pace.runsOutInMs)}`)
    else if (pace.sparePercent !== undefined) parts.push(`~${pace.sparePercent}% spare`)
    return parts.join(" · ")
}

export const progressBar = (line: UsageLine, width = BAR_WIDTH) => {
    const halves = Math.round(usageRatio(line) * width * 2)
    const full = Math.floor(halves / 2)
    const half = halves % 2
    return {
        filled: "━".repeat(full) + (half ? "╸" : ""),
        empty: "━".repeat(width - full - half),
    }
}

export const rightAlign = (value: string, width: number) => value.padStart(width)
