import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
    Chart,
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    Title,
    Tooltip,
    Legend,
    Filler,
} from "chart.js";

import init, {
    alloc_op as wasm_alloc_op,
    alloc_op_reset as wasm_alloc_op_reset,
} from "../../generated_wasm/rustweek_2026_wasm_myths.js";

Chart.register(
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    Title,
    Tooltip,
    Legend,
    Filler,
);

const TREE_DEPTH = 8;
const TREE_BRANCHING = 4;
const RETAIN_FRAMES = 30;

const ITERATIONS_PER_PHASE = 600;
const YIELD_EVERY = 4;
const COOLDOWN_MS = 3000;

type Variant = "js_alloc" | "wasm_alloc";
type RunState = "idle" | "running" | "paused" | "done";

const VARIANT_COLORS: Record<Variant, string> = {
    js_alloc: "#e15759",
    wasm_alloc: "#4e79a7",
};
const VARIANT_LABELS: Record<Variant, string> = {
    js_alloc: "JavaScript (GC heap)",
    wasm_alloc: "Rust → Wasm (linear memory)",
};

interface PerfWithMemory extends Performance {
    memory?: { usedJSHeapSize: number };
}
function readHeapMB(): number | null {
    const mem = (performance as PerfWithMemory).memory;
    if (mem && typeof mem.usedJSHeapSize === "number") {
        return mem.usedJSHeapSize / (1024 * 1024);
    }
    return null;
}
function yieldToEventLoop(): Promise<void> {
    return new Promise((r) => setTimeout(r, 0));
}
function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

const JS_RETAIN: JsTreeNode[] = [];

function jsAllocOpReset(): void {
    JS_RETAIN.length = 0;
}

// ANCHOR: js_alloc
interface JsTreeNode {
    value: number;
    children: JsTreeNode[];
}

function jsBuildTree(depth: number, branching: number, seed: number): JsTreeNode {
    const children: JsTreeNode[] = [];
    if (depth > 0) {
        for (let i = 0; i < branching; i++) {
            const childSeed = ((seed * 31) + i) >>> 0;
            children.push(jsBuildTree(depth - 1, branching, childSeed));
        }
    }
    return { value: seed, children };
}

function jsSumTree(node: JsTreeNode): number {
    let sum = node.value;
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
        sum = (sum + jsSumTree(children[i])) >>> 0;
    }
    return sum;
}
// ANCHOR_END: js_alloc

function jsAllocOp(
    depth: number,
    branching: number,
    retainFrames: number,
    seed: number,
): number {
    const tree = jsBuildTree(depth, branching, seed);
    const sum = jsSumTree(tree);
    if (retainFrames > 0) {
        JS_RETAIN.push(tree);
        while (JS_RETAIN.length > retainFrames) JS_RETAIN.shift();
    }
    return sum;
}

interface PhaseResult {
    work: Float64Array;
    heap: (number | null)[];
}
function makePhaseResult(): PhaseResult {
    return {
        work: new Float64Array(ITERATIONS_PER_PHASE),
        heap: new Array<number | null>(ITERATIONS_PER_PHASE).fill(null),
    };
}

function quantile(sortedAsc: number[], q: number): number {
    if (sortedAsc.length === 0) return NaN;
    const idx = Math.min(
        sortedAsc.length - 1,
        Math.max(0, Math.round((sortedAsc.length - 1) * q)),
    );
    return sortedAsc[idx];
}

interface Stats {
    n: number;
    min: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
    mean: number;
}
function summarize(values: ArrayLike<number>, len: number): Stats {
    const arr = new Array<number>(len);
    for (let i = 0; i < len; i++) arr[i] = values[i] as number;
    arr.sort((a, b) => a - b);
    const mean = arr.reduce((s, x) => s + x, 0) / Math.max(1, len);
    return {
        n: len,
        min: len ? arr[0] : NaN,
        p50: quantile(arr, 0.5),
        p95: quantile(arr, 0.95),
        p99: quantile(arr, 0.99),
        max: len ? arr[len - 1] : NaN,
        mean,
    };
}

function fmt(x: number): string {
    if (!isFinite(x)) return "—";
    if (x >= 100) return x.toFixed(1);
    if (x >= 10) return x.toFixed(2);
    return x.toFixed(3);
}

@customElement("gc-jitter-viewer")
class GcJitterViewer extends LitElement {
    @state() private accessor state: RunState = "idle";
    @state() private accessor phase: Variant | "cooldown" | null = null;
    @state() private accessor progress = 0;
    @state() private accessor heapAvailable = readHeapMB() != null;
    @state() private accessor statsTick = 0;

    private results: Record<Variant, PhaseResult> = {
        js_alloc: makePhaseResult(),
        wasm_alloc: makePhaseResult(),
    };
    private filled: Record<Variant, number> = { js_alloc: 0, wasm_alloc: 0 };
    private wasmReady: Promise<unknown> | null = null;
    private wasmInitialised = false;

    private workChart: Chart | null = null;
    private heapChart: Chart | null = null;
    private observer: IntersectionObserver | null = null;
    private rafPending = false;
    private statsTimer: number | null = null;
    private cancelled = false;
    private pauseDeferred: { promise: Promise<void>; resolve: () => void } | null = null;
    // Sink so the optimiser cannot drop the work.
    private sinkHole = 0;

    override createRenderRoot() {
        return this;
    }

    override connectedCallback() {
        super.connectedCallback();
        this.observer = new IntersectionObserver((entries) => {
            const entry = entries[0];
            if (entry?.isIntersecting && this.state === "idle") {
                void this.start();
            }
        });
        this.observer.observe(this);
    }

    override disconnectedCallback() {
        super.disconnectedCallback();
        this.cancelled = true;
        this.pauseDeferred?.resolve();
        this.observer?.disconnect();
        this.observer = null;
        this.stopStatsTimer();
        this.workChart?.destroy();
        this.workChart = null;
        this.heapChart?.destroy();
        this.heapChart = null;
    }

    override updated() {
        if (!this.workChart) this.initCharts();
    }

    private async ensureWasm(): Promise<void> {
        if (!this.wasmReady) this.wasmReady = init();
        await this.wasmReady;
        this.wasmInitialised = true;
    }

    private resetResults(): void {
        this.results.js_alloc = makePhaseResult();
        this.results.wasm_alloc = makePhaseResult();
        this.filled.js_alloc = 0;
        this.filled.wasm_alloc = 0;
        jsAllocOpReset();
        if (this.wasmInitialised) wasm_alloc_op_reset();
    }

    private async waitWhilePaused(): Promise<void> {
        while (this.pauseDeferred && !this.cancelled) {
            await this.pauseDeferred.promise;
        }
    }

    private async runPhase(variant: Variant): Promise<void> {
        this.phase = variant;
        const opFn: (seed: number) => number =
            variant === "js_alloc"
                ? (seed) => jsAllocOp(TREE_DEPTH, TREE_BRANCHING, RETAIN_FRAMES, seed)
                : (seed) => wasm_alloc_op(TREE_DEPTH, TREE_BRANCHING, RETAIN_FRAMES, seed);
        const buf = this.results[variant];

        for (let i = 0; i < ITERATIONS_PER_PHASE; i++) {
            if (this.cancelled) return;
            await this.waitWhilePaused();

            const seed = (i + 1) >>> 0;
            const t0 = performance.now();
            this.sinkHole = (this.sinkHole + opFn(seed)) >>> 0;
            const workMs = performance.now() - t0;
            const heapMB = readHeapMB();

            buf.work[i] = workMs;
            buf.heap[i] = heapMB;
            this.filled[variant] = i + 1;

            if ((i & (YIELD_EVERY - 1)) === 0) {
                this.scheduleChartUpdate();
                await yieldToEventLoop();
            }
        }
        this.scheduleChartUpdate();

        if (variant === "js_alloc") jsAllocOpReset();
        else wasm_alloc_op_reset();
    }

    private async cooldown(): Promise<void> {
        this.phase = "cooldown";
        this.scheduleChartUpdate();
        await delay(COOLDOWN_MS);
    }

    private async start(): Promise<void> {
        if (this.state === "running") return;
        this.cancelled = false;
        this.state = "running";
        this.resetResults();
        this.startStatsTimer();
        try {
            await this.ensureWasm();
            await this.runPhase("js_alloc");
            if (this.cancelled) return;
            await this.cooldown();
            if (this.cancelled) return;
            await this.runPhase("wasm_alloc");
        } finally {
            this.phase = null;
            this.stopStatsTimer();
            this.statsTick++;
            if (!this.cancelled) this.state = "done";
            this.scheduleChartUpdate();
        }
    }

    private pause(): void {
        if (this.state !== "running" || this.pauseDeferred) return;
        let resolve!: () => void;
        const promise = new Promise<void>((r) => {
            resolve = r;
        });
        this.pauseDeferred = { promise, resolve };
        this.state = "paused";
    }

    private resume(): void {
        if (this.state !== "paused" || !this.pauseDeferred) return;
        const d = this.pauseDeferred;
        this.pauseDeferred = null;
        this.state = "running";
        d.resolve();
    }

    private restart(): void {
        this.cancelled = true;
        this.pauseDeferred?.resolve();
        this.pauseDeferred = null;
        // Defer to next microtask so the in-flight loop sees `cancelled`.
        queueMicrotask(() => {
            this.cancelled = false;
            void this.start();
        });
    }

    private startStatsTimer(): void {
        this.stopStatsTimer();
        this.statsTimer = window.setInterval(() => {
            this.statsTick++;
        }, 500);
    }

    private stopStatsTimer(): void {
        if (this.statsTimer != null) {
            clearInterval(this.statsTimer);
            this.statsTimer = null;
        }
    }

    private scheduleChartUpdate(): void {
        if (this.rafPending) return;
        this.rafPending = true;
        requestAnimationFrame(() => {
            this.rafPending = false;
            this.refreshCharts();
        });
    }

    private initCharts(): void {
        const workCanvas = this.querySelector<HTMLCanvasElement>("canvas[data-role=work]");
        const heapCanvas = this.querySelector<HTMLCanvasElement>("canvas[data-role=heap]");
        if (!workCanvas || !heapCanvas) return;

        const sharedDatasets = (yLabel: string) =>
            (["js_alloc", "wasm_alloc"] as const).map((variant) => ({
                label: VARIANT_LABELS[variant],
                data: [] as number[],
                borderColor: VARIANT_COLORS[variant],
                backgroundColor: "transparent",
                borderWidth: 1.25,
                pointRadius: 0,
                spanGaps: false,
                tension: 0,
                _variant: variant,
                _yLabel: yLabel,
            }));

        this.workChart = new Chart(workCanvas, {
            type: "line",
            data: { labels: [], datasets: sharedDatasets("ms") },
            options: {
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: "top" },
                    title: {
                        display: true,
                        text: "Per-call work time (ms) — JS phase first, then Wasm phase",
                    },
                },
                scales: {
                    x: { display: false },
                    y: {
                        title: { display: true, text: "ms / alloc_op call" },
                        beginAtZero: true,
                    },
                },
            },
        });

        this.heapChart = new Chart(heapCanvas, {
            type: "line",
            data: { labels: [], datasets: sharedDatasets("MB") },
            options: {
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: "top" },
                    title: {
                        display: true,
                        text: "Main-thread performance.memory.usedJSHeapSize (MB)",
                    },
                },
                scales: {
                    x: { display: false },
                    y: { title: { display: true, text: "MB" } },
                },
            },
        });

        this.refreshCharts();
    }

    private refreshCharts(): void {
        if (!this.workChart || !this.heapChart) return;
        const variants = ["js_alloc", "wasm_alloc"] as const;
        const totalLen = ITERATIONS_PER_PHASE * 2;
        const labels = new Array<string>(totalLen);
        for (let i = 0; i < totalLen; i++) labels[i] = String(i);

        for (const chart of [this.workChart, this.heapChart]) {
            chart.data.labels = labels;
        }

        for (let v = 0; v < variants.length; v++) {
            const variant = variants[v];
            const buf = this.results[variant];
            const filled = this.filled[variant];
            const offset = v * ITERATIONS_PER_PHASE;

            const workData: (number | null)[] = new Array(totalLen).fill(null);
            const heapData: (number | null)[] = new Array(totalLen).fill(null);
            for (let i = 0; i < filled; i++) {
                workData[offset + i] = buf.work[i];
                heapData[offset + i] = buf.heap[i];
            }
            this.workChart.data.datasets[v].data = workData as number[];
            this.heapChart.data.datasets[v].data = heapData as number[];
        }
        this.workChart.update("none");
        this.heapChart.update("none");
    }

    private renderStatsRow(variant: Variant): unknown {
        // statsTick reference forces Lit to re-render the stats table.
        void this.statsTick;
        const buf = this.results[variant];
        const filled = this.filled[variant];
        const stats = summarize(buf.work, filled);
        return html`
            <tr>
                <td>
                    <span style="display:inline-block;width:10px;height:10px;background:${VARIANT_COLORS[variant]};border-radius:2px;margin-right:6px;vertical-align:middle"></span>
                    ${VARIANT_LABELS[variant]}
                </td>
                <td>${stats.n}</td>
                <td>${fmt(stats.min)}</td>
                <td>${fmt(stats.p50)}</td>
                <td>${fmt(stats.p95)}</td>
                <td><strong>${fmt(stats.p99)}</strong></td>
                <td>${fmt(stats.max)}</td>
                <td>${fmt(stats.mean)}</td>
            </tr>
        `;
    }

    private renderStatusPill(): unknown {
        let text: string;
        switch (this.state) {
            case "idle":
                text = "idle";
                break;
            case "paused":
                text = "paused";
                break;
            case "done":
                text = "done";
                break;
            case "running": {
                const total = ITERATIONS_PER_PHASE;
                const filled =
                    this.phase === "js_alloc" || this.phase === "wasm_alloc"
                        ? this.filled[this.phase]
                        : 0;
                const phaseLabel =
                    this.phase === "cooldown"
                        ? "cooldown (waiting for GC to settle)"
                        : this.phase
                            ? `${VARIANT_LABELS[this.phase]} ${filled}/${total}`
                            : "starting…";
                text = phaseLabel;
                break;
            }
        }
        return html`<span
            style="display:inline-block;padding:2px 8px;border-radius:999px;background:#eee;font-size:0.8em;font-family:ui-monospace,Menlo,monospace"
        >${text}</span>`;
    }

    render() {
        const buttonStyle =
            "padding:4px 10px;cursor:pointer;border:1px solid #ccc;border-radius:4px;background:#fff;font-size:0.85em;margin-left:6px";
        const canRestart = this.state === "done" || this.state === "running" || this.state === "paused";
        return html`
            <div style="border:1px solid #e5e5e5;border-radius:6px;padding:12px;background:#fff">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">
                    <div style="font-size:0.85em;opacity:0.8">
                        ${this.renderStatusPill()}
                        <span style="margin-left:8px">
                            Sequential phases: <code>jsAllocOp</code> then
                            <code>wasm_alloc_op</code>, ${ITERATIONS_PER_PHASE}
                            calls each. Per call: build + walk a balanced
                            ${TREE_BRANCHING}-ary tree of depth ${TREE_DEPTH}
                            (${(((TREE_BRANCHING ** (TREE_DEPTH + 1) - 1) / (TREE_BRANCHING - 1))).toLocaleString()}
                            nodes), retained for ${RETAIN_FRAMES} calls.
                        </span>
                        ${this.heapAvailable
                ? html``
                : html`<br /><em>performance.memory not exposed in this browser — heap chart will stay empty.</em>`}
                    </div>
                    <div>
                        ${this.state === "running"
                ? html`<button style=${buttonStyle} @click=${this.pause}>Pause</button>`
                : this.state === "paused"
                    ? html`<button style=${buttonStyle} @click=${this.resume}>Resume</button>`
                    : html``}
                        ${canRestart
                ? html`<button style=${buttonStyle} @click=${this.restart}>Restart</button>`
                : html``}
                    </div>
                </div>

                <div style="position:relative;height:240px;margin-bottom:12px">
                    <canvas data-role="work"></canvas>
                </div>
                <div style="position:relative;height:200px;margin-bottom:12px">
                    <canvas data-role="heap"></canvas>
                </div>

                <table style="width:100%;border-collapse:collapse;font-size:13px;font-family:ui-monospace,Menlo,monospace">
                    <thead style="background:#f5f5f5">
                        <tr>
                            <th style="text-align:left;padding:4px 8px">variant</th>
                            <th style="text-align:right;padding:4px 8px">n</th>
                            <th style="text-align:right;padding:4px 8px">min</th>
                            <th style="text-align:right;padding:4px 8px">p50</th>
                            <th style="text-align:right;padding:4px 8px">p95</th>
                            <th style="text-align:right;padding:4px 8px">p99</th>
                            <th style="text-align:right;padding:4px 8px">max</th>
                            <th style="text-align:right;padding:4px 8px">mean</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.renderStatsRow("js_alloc")}
                        ${this.renderStatsRow("wasm_alloc")}
                    </tbody>
                </table>
            </div>
        `;
    }
}
