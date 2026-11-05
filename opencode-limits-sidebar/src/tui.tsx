/** @jsxImportSource @opentui/solid */
import { createSignal, createMemo, onCleanup, onMount, Show, For } from "solid-js"
import { Plugin } from "@opencode/plugin/tui"
import {
    type Palette,
    type ProviderUsage,
    type UsageLine,
    BAR_WIDTH,
    RESET_COLUMN_WIDTH,
    REFRESH_INTERVAL_MS,
    USED_COLUMN_WIDTH,
    getPalette,
    getPace,
    isCountRow,
    lineMetric,
    paceNote,
    progressBar,
    providerMetaText,
    resetText,
    rightAlign,
} from "./shared/limits.ts"

const OPENUSAGE_API = "http://127.0.0.1:6736/v1/usage"

const LimitRow = (props: {
    palette: Palette
    line: UsageLine
}) => {
    const bar = createMemo(() => progressBar(props.line))
    const pace = createMemo(() => getPace(props.line))
    const paceColor = createMemo(() => {
        const severity = pace().severity
        return severity === "critical" ? props.palette.critical
            : severity === "warning" ? props.palette.warning
            : props.palette.ok
    })
    const note = createMemo(() => paceNote(pace()))

    return (
        <box width="100%" flexDirection="column">
            <box width="100%" flexDirection="row">
                <box flexGrow={1} flexShrink={1} minWidth={0}>
                    <text fg={props.palette.text} wrapMode="none" truncate>{props.line.label}</text>
                </box>
                <box width={BAR_WIDTH} flexShrink={0} flexDirection="row" marginLeft={1}>
                    <text fg={paceColor()} wrapMode="none">{bar().filled}</text>
                    <text fg={props.palette.subtle} wrapMode="none">{bar().empty}</text>
                </box>
                <box width={USED_COLUMN_WIDTH} flexShrink={0} justifyContent="flex-end">
                    <text fg={props.palette.text}>{lineMetric(props.line)}</text>
                </box>
                <box width={RESET_COLUMN_WIDTH} flexShrink={0} justifyContent="flex-end" marginLeft={1}>
                    <text fg={props.palette.muted}>{rightAlign(resetText(props.line), RESET_COLUMN_WIDTH)}</text>
                </box>
            </box>
            <Show when={note()}>
                <text fg={pace().severity === "ok" ? props.palette.muted : paceColor()} wrapMode="none" truncate>{note()}</text>
            </Show>
        </box>
    )
}

const ProviderLimits = (props: { palette: Palette; provider: ProviderUsage }) => {
    const lines = createMemo(() => props.provider.lines || [])

    const session = createMemo(() => lines().find(line => line.label === "Session" && line.type === "progress"))
    const weekly = createMemo(() => lines().find(line => line.label === "Weekly" && line.type === "progress"))
    const extras = createMemo(() => lines().filter(line => line.type === "progress" && line.label !== "Session" && line.label !== "Weekly" && !isCountRow(line)))
    const meta = createMemo(() => providerMetaText(props.provider))

    return (
        <box width="100%" flexDirection="column" marginBottom={1}>
            <box width="100%" flexDirection="row" justifyContent="space-between">
                <text fg={props.palette.text}><b>{props.provider.displayName}</b></text>
                <text fg={props.palette.muted}>{meta()}</text>
            </box>

            <Show when={session()}>
                {line => <LimitRow palette={props.palette} line={line()} />}
            </Show>
            <Show when={weekly()}>
                {line => <LimitRow palette={props.palette} line={line()} />}
            </Show>
            <For each={extras()}>
                {line => <LimitRow palette={props.palette} line={line} />}
            </For>
        </box>
    )
}

const SidebarLimits = (props: { context: Plugin.Context }) => {
    const palette = createMemo(() => getPalette(props.context.theme, props.context.themeMode))
    const [providers, setProviders] = createSignal<ProviderUsage[]>([])
    const [loading, setLoading] = createSignal(true)
    const [errorMsg, setErrorMsg] = createSignal("")

    const fetchUsage = async () => {
        try {
            const res = await fetch(OPENUSAGE_API)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json() as ProviderUsage[]
            setProviders(data)
            setErrorMsg("")
        } catch {
            if (providers().length === 0) {
                setErrorMsg("OpenUsage offline")
            }
        } finally {
            setLoading(false)
        }
    }

    onMount(() => {
        void fetchUsage()
        const timer = setInterval(() => void fetchUsage(), REFRESH_INTERVAL_MS)
        onCleanup(() => clearInterval(timer))
    })

    return (
        <box width="100%" flexDirection="column">
            <box flexDirection="row" justifyContent="space-between" width="100%">
                <text fg={palette().accent}><b>USAGE LIMITS</b></text>
                <Show when={loading()}>
                    <text fg={palette().muted}>...</text>
                </Show>
            </box>

            <Show when={errorMsg()}>
                {msg => <text fg={palette().warning}>{msg()}</text>}
            </Show>

            <For each={providers()}>
                {provider => <ProviderLimits palette={palette()} provider={provider} />}
            </For>
        </box>
    )
}

export default Plugin.define({
    id: "opencode-limits-sidebar",
    setup(context) {
        return context.ui.slot({
            append: "sidebar.content",
            render: () => <SidebarLimits context={context} />,
        })
    },
})
