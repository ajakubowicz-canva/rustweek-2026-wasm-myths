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
} from "chart.js";

import init, {
    initThreadPool,
    saxpy_buffers_resize,
    saxpy_buffer_x_view,
    saxpy_buffer_y_view,
    saxpy_buffer_out_view,
    saxpy_scalar,
    saxpy_parallel,
} from "../../generated_wasm/threads/index.js";

import SaxpyCloneWorker from "../workers/saxpy-worker-clone.js?worker";
import SaxpyTransferWorker from "../workers/saxpy-worker-transfer.js?worker";
import { fillRandomFloat32 } from "../benchmarks/simd/shared.js";

Chart.register(
    LineController,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    Title,
    Tooltip,
    Legend,
);

const N_SWEEP = [65536, 262144, 1048576, 4194304] as const;
const ROUNDS = 6;
const SAXPY_A = 2.0;
const MAX_THREADS = 8;

function chooseThreadCount(): number {
    const hw = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
    return Math.max(2, Math.min(MAX_THREADS, hw));
}

type VariantId =
    | "js_main"
    | "js_workers_clone"
    | "js_workers_transfer"
    | "wasm_scalar"
    | "wasm_threads";

const VARIANTS: readonly VariantId[] = [
    "js_main",
    "js_workers_clone",
    "js_workers_transfer",
    "wasm_scalar",
    "wasm_threads",
] as const;

const VARIANT_LABELS: Record<VariantId, string> = {
    js_main: "JavaScript (single-threaded)",
    js_workers_clone: "JavaScript workers (structured clone)",
    js_workers_transfer: "JavaScript workers (Transferable + persistent buffers)",
    wasm_scalar: "Wasm (single-threaded)",
    wasm_threads: "Wasm (rayon threads)",
};

const VARIANT_COLORS: Record<VariantId, string> = {
    js_main: "#bdbdbd",
    js_workers_clone: "#e15759",
    js_workers_transfer: "#f28e2b",
    wasm_scalar: "#76b7b2",
    wasm_threads: "#4e79a7",
};

interface SaxpyCloneResponse {
    requestId: number;
    output: Float32Array;
}

interface SaxpyTransferResponse {
    requestId: number;
    x: Float32Array;
    y: Float32Array;
    output: Float32Array;
}

type RunState = "idle" | "checking-coi" | "loading" | "running" | "done" | "blocked";

interface ResultPoint {
    N: number;
    duration: number;
}

@customElement("wasm-threading-viewer")
class WasmThreadingViewer extends LitElement {
    @state() private accessor state: RunState = "idle";
    @state() private accessor statusMessage = "";
    @state() private accessor currentN: number | null = null;
    @state() private accessor threadCount = 0;
    @state() private accessor results: Record<VariantId, ResultPoint[]> = {
        js_main: [],
        js_workers_clone: [],
        js_workers_transfer: [],
        wasm_scalar: [],
        wasm_threads: [],
    };

    private chart: Chart | null = null;
    private observer: IntersectionObserver | null = null;

    private cloneWorkerPool: Worker[] = [];
    private transferWorkerPool: Worker[] = [];

    private chunkXs: Float32Array[] = [];
    private chunkYs: Float32Array[] = [];

    private transferChunkOuts: Float32Array[] = [];

    private jsX: Float32Array | null = null;
    private jsY: Float32Array | null = null;
    private jsOutput: Float32Array | null = null;

    private wasmReady: Promise<void> | null = null;
    private cachedWasmN = -1;
    private wasmX: Float32Array | null = null;
    private wasmY: Float32Array | null = null;
    private wasmOut: Float32Array | null = null;

    // Sink so the JIT cannot drop the work.
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
        this.observer?.disconnect();
        this.observer = null;
        for (const w of this.cloneWorkerPool) w.terminate();
        for (const w of this.transferWorkerPool) w.terminate();
        this.cloneWorkerPool = [];
        this.transferWorkerPool = [];
        this.chart?.destroy();
        this.chart = null;
    }

    override updated() {
        if (!this.chart) this.initChart();
        else this.refreshChart();
    }

    // -- Wasm + worker pool init ------------------------------------------

    private async ensureWasmAndPool(): Promise<boolean> {
        if (typeof SharedArrayBuffer === "undefined" || !crossOriginIsolated) {
            this.state = "blocked";
            this.statusMessage =
                "This page needs cross-origin isolation. The service worker shim should install automatically — try a hard refresh.";
            return false;
        }

        const K = chooseThreadCount();
        this.threadCount = K;

        if (!this.wasmReady) {
            this.statusMessage = "Loading threaded Wasm artefact and spinning up rayon thread pool…";
            this.state = "loading";
            this.wasmReady = (async () => {
                await init();
                await initThreadPool(K);
            })();
        }
        await this.wasmReady;

        if (this.cloneWorkerPool.length !== K) {
            for (const w of this.cloneWorkerPool) w.terminate();
            this.cloneWorkerPool = [];
            for (let i = 0; i < K; i++) this.cloneWorkerPool.push(new SaxpyCloneWorker());
        }
        if (this.transferWorkerPool.length !== K) {
            for (const w of this.transferWorkerPool) w.terminate();
            this.transferWorkerPool = [];
            for (let i = 0; i < K; i++) this.transferWorkerPool.push(new SaxpyTransferWorker());
        }
        return true;
    }

    private ensureWasmBuffers(N: number): { x: Float32Array; y: Float32Array; out: Float32Array } {
        if (this.cachedWasmN !== N) {
            saxpy_buffers_resize(N);
            this.cachedWasmN = N;
            this.wasmX = null;
            this.wasmY = null;
            this.wasmOut = null;
        }
        if (!this.wasmX || this.wasmX.byteLength === 0) this.wasmX = saxpy_buffer_x_view();
        if (!this.wasmY || this.wasmY.byteLength === 0) this.wasmY = saxpy_buffer_y_view();
        if (!this.wasmOut || this.wasmOut.byteLength === 0) this.wasmOut = saxpy_buffer_out_view();
        return { x: this.wasmX, y: this.wasmY, out: this.wasmOut };
    }

    private ensureJsBuffers(N: number, K: number): {
        x: Float32Array;
        y: Float32Array;
        output: Float32Array;
    } {
        if (!this.jsX || this.jsX.length !== N) {
            this.jsX = new Float32Array(N);
            this.jsY = new Float32Array(N);
            this.jsOutput = new Float32Array(N);
        }
        const base = Math.floor(N / K);
        const remainder = N - base * K;
        const want = (idx: number) => base + (idx === K - 1 ? remainder : 0);
        if (this.chunkXs.length !== K || this.chunkXs[0]?.length !== want(0)) {
            this.chunkXs = [];
            this.chunkYs = [];
            this.transferChunkOuts = [];
            for (let i = 0; i < K; i++) {
                this.chunkXs.push(new Float32Array(want(i)));
                this.chunkYs.push(new Float32Array(want(i)));
                this.transferChunkOuts.push(new Float32Array(want(i)));
            }
        }
        return { x: this.jsX!, y: this.jsY!, output: this.jsOutput! };
    }

    // -- Variant runners --------------------------------------------------

    private async runSweep(): Promise<void> {
        const K = this.threadCount;

        for (const N of N_SWEEP) {
            if (!this.isConnected) return;
            this.currentN = N;

            const { x: jsX, y: jsY, output: jsOutput } = this.ensureJsBuffers(N, K);
            const wasmBufs = this.ensureWasmBuffers(N);

            fillRandomFloat32(jsX, 1);
            fillRandomFloat32(jsY, 0x9e3779b9);
            fillRandomFloat32(wasmBufs.x, 1);
            fillRandomFloat32(wasmBufs.y, 0x9e3779b9);

            const base = Math.floor(N / K);
            for (let k = 0; k < K; k++) {
                const start = k * base;
                const end = k === K - 1 ? N : start + base;
                this.chunkXs[k].set(jsX.subarray(start, end));
                this.chunkYs[k].set(jsY.subarray(start, end));
            }

            const jsMainMs = await this.timeRounds(() => this.runJsMain(jsX, jsY, jsOutput));
            const jsWorkersCloneMs = await this.timeRounds(() =>
                this.runJsWorkersClone(jsOutput, K),
            );
            const jsWorkersTransferMs = await this.timeRounds(() =>
                this.runJsWorkersTransfer(jsOutput, K),
            );
            const wasmScalarMs = await this.timeRounds(() => {
                this.refreshWasmViewsIfDetached();
                saxpy_scalar(N, SAXPY_A);
                this.sinkHole = (this.sinkHole + (this.wasmOut?.[0] ?? 0)) | 0;
            });
            const wasmThreadsMs = await this.timeRounds(() => {
                this.refreshWasmViewsIfDetached();
                saxpy_parallel(N, SAXPY_A);
                this.sinkHole = (this.sinkHole + (this.wasmOut?.[0] ?? 0)) | 0;
            });

            this.results = {
                js_main: [...this.results.js_main, { N, duration: jsMainMs }],
                js_workers_clone: [
                    ...this.results.js_workers_clone,
                    { N, duration: jsWorkersCloneMs },
                ],
                js_workers_transfer: [
                    ...this.results.js_workers_transfer,
                    { N, duration: jsWorkersTransferMs },
                ],
                wasm_scalar: [...this.results.wasm_scalar, { N, duration: wasmScalarMs }],
                wasm_threads: [...this.results.wasm_threads, { N, duration: wasmThreadsMs }],
            };
            // Yield to the event loop so the UI can refresh between N
            // points.
            await new Promise((r) => setTimeout(r, 0));
        }
    }

    private refreshWasmViewsIfDetached(): void {
        if (!this.wasmX || this.wasmX.byteLength === 0) this.wasmX = saxpy_buffer_x_view();
        if (!this.wasmY || this.wasmY.byteLength === 0) this.wasmY = saxpy_buffer_y_view();
        if (!this.wasmOut || this.wasmOut.byteLength === 0) this.wasmOut = saxpy_buffer_out_view();
    }

    private async timeRounds(fn: () => unknown | Promise<unknown>): Promise<number> {
        let total = 0;
        for (let r = 0; r < ROUNDS; r++) {
            const start = performance.now();
            const ret = fn();
            if (ret instanceof Promise) await ret;
            total += performance.now() - start;
        }
        return total / ROUNDS;
    }

    private runJsMain(x: Float32Array, y: Float32Array, output: Float32Array): void {
        const a = SAXPY_A;
        const n = x.length;
        for (let i = 0; i < n; i++) {
            output[i] = a * x[i] + y[i];
        }
        this.sinkHole = (this.sinkHole + output[0]) | 0;
    }

    private async runJsWorkersClone(output: Float32Array, K: number): Promise<void> {
        const base = Math.floor(output.length / K);
        const promises = this.cloneWorkerPool.map((worker, k) => {
            return new Promise<Float32Array>((resolve) => {
                const onMessage = (event: MessageEvent<SaxpyCloneResponse>) => {
                    if (event.data.requestId !== k) return;
                    worker.removeEventListener("message", onMessage);
                    resolve(event.data.output);
                };
                worker.addEventListener("message", onMessage);
                worker.postMessage({
                    requestId: k,
                    a: SAXPY_A,
                    x: this.chunkXs[k],
                    y: this.chunkYs[k],
                });
            });
        });

        const replies = await Promise.all(promises);
        for (let k = 0; k < K; k++) {
            output.set(replies[k], k * base);
        }
        this.sinkHole = (this.sinkHole + output[0]) | 0;
    }

    private async runJsWorkersTransfer(output: Float32Array, K: number): Promise<void> {
        const base = Math.floor(output.length / K);
        const promises = this.transferWorkerPool.map((worker, k) => {
            return new Promise<SaxpyTransferResponse>((resolve) => {
                const onMessage = (event: MessageEvent<SaxpyTransferResponse>) => {
                    if (event.data.requestId !== k) return;
                    worker.removeEventListener("message", onMessage);
                    resolve(event.data);
                };
                worker.addEventListener("message", onMessage);
                const x = this.chunkXs[k];
                const y = this.chunkYs[k];
                const out = this.transferChunkOuts[k];
                worker.postMessage(
                    { requestId: k, a: SAXPY_A, x, y, output: out },
                    [x.buffer, y.buffer, out.buffer],
                );
            });
        });

        const replies = await Promise.all(promises);
        for (let k = 0; k < K; k++) {
            this.chunkXs[k] = replies[k].x;
            this.chunkYs[k] = replies[k].y;
            this.transferChunkOuts[k] = replies[k].output;
            output.set(replies[k].output, k * base);
        }
        this.sinkHole = (this.sinkHole + output[0]) | 0;
    }

    private async start(): Promise<void> {
        if (this.state === "running" || this.state === "loading") return;
        this.state = "checking-coi";
        this.statusMessage = "";
        this.results = {
            js_main: [],
            js_workers_clone: [],
            js_workers_transfer: [],
            wasm_scalar: [],
            wasm_threads: [],
        };

        const ok = await this.ensureWasmAndPool();
        if (!ok) return;

        this.state = "running";
        this.statusMessage = "Sweeping element counts…";
        try {
            await this.runSweep();
            this.state = "done";
            this.statusMessage = "";
        } catch (err) {
            this.state = "blocked";
            this.statusMessage = `Sweep failed: ${err instanceof Error ? err.message : String(err)}`;
        }
    }

    private restart(): void {
        if (this.state === "running" || this.state === "loading") return;
        void this.start();
    }

    private initChart(): void {
        const canvas = this.querySelector<HTMLCanvasElement>("canvas");
        if (!canvas) return;
        this.chart = new Chart(canvas, {
            type: "line",
            data: {
                labels: N_SWEEP.map(String),
                datasets: VARIANTS.map((id) => ({
                    label: VARIANT_LABELS[id],
                    data: [] as number[],
                    borderColor: VARIANT_COLORS[id],
                    backgroundColor: "transparent",
                    borderWidth:
                        id === "js_workers_clone" ||
                            id === "js_workers_transfer" ||
                            id === "wasm_threads"
                            ? 2
                            : 1.25,
                    pointRadius: 3,
                    tension: 0.1,
                    _variant: id,
                })),
            },
            options: {
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: "top" },
                    title: {
                        display: true,
                        text: "Per-call SAXPY duration (ms) — sweep over array length N",
                    },
                },
                scales: {
                    x: {
                        type: "linear",
                        title: { display: true, text: "# of f32 elements per call" },
                    },
                    y: {
                        title: { display: true, text: "avg duration (ms)" },
                        beginAtZero: true,
                    },
                },
            },
        });
        this.refreshChart();
    }

    private refreshChart(): void {
        if (!this.chart) return;
        for (let v = 0; v < VARIANTS.length; v++) {
            const data = this.results[VARIANTS[v]].map((p) => ({ x: p.N, y: p.duration }));
            this.chart.data.datasets[v].data = data as unknown as number[];
        }
        this.chart.update("none");
    }

    private fmt(x: number): string {
        if (!isFinite(x)) return "—";
        if (x >= 100) return x.toFixed(1);
        if (x >= 10) return x.toFixed(2);
        if (x >= 1) return x.toFixed(2);
        return x.toFixed(3);
    }

    private renderStatus() {
        if (this.state === "blocked") {
            return html`<p style="color:#b00;font-size:0.9em">${this.statusMessage}</p>`;
        }
        if (this.state === "loading" || this.state === "checking-coi") {
            return html`<p style="font-size:0.85em;opacity:0.8">${this.statusMessage || "Initialising…"}</p>`;
        }
        if (this.state === "running") {
            return html`<p style="font-size:0.85em;opacity:0.8">
                Pool size: ${this.threadCount}. Currently sweeping
                ${this.currentN === null ? "…" : `N = ${this.currentN.toLocaleString()}`}.
            </p>`;
        }
        if (this.state === "done") {
            return html`<p style="font-size:0.85em;opacity:0.8">
                Pool size: ${this.threadCount}. ${ROUNDS} rounds per variant per N.
            </p>`;
        }
        return html``;
    }

    private renderTable() {
        if (this.state !== "done") return html``;
        return html`
            <table style="width:100%;border-collapse:collapse;font-size:13px;font-family:ui-monospace,Menlo,monospace;margin-top:12px">
                <thead style="background:#f5f5f5">
                    <tr>
                        <th style="text-align:left;padding:4px 8px">variant</th>
                        ${N_SWEEP.map(
            (n) => html`<th style="text-align:right;padding:4px 8px">N=${n.toLocaleString()}</th>`,
        )}
                    </tr>
                </thead>
                <tbody>
                    ${VARIANTS.map(
            (id) => html`
                            <tr>
                                <td style="padding:4px 8px">
                                    <span style="display:inline-block;width:10px;height:10px;background:${VARIANT_COLORS[id]};border-radius:2px;margin-right:6px;vertical-align:middle"></span>
                                    ${VARIANT_LABELS[id]}
                                </td>
                                ${this.results[id].map(
                (p) =>
                    html`<td style="text-align:right;padding:4px 8px">${this.fmt(p.duration)}</td>`,
            )}
                            </tr>
                        `,
        )}
                </tbody>
            </table>
        `;
    }

    render() {
        const buttonStyle =
            "padding:4px 10px;cursor:pointer;border:1px solid #ccc;border-radius:4px;background:#fff;font-size:0.85em";
        const canRestart = this.state === "done" || this.state === "blocked";
        return html`
            <div style="border:1px solid #e5e5e5;border-radius:6px;padding:12px;background:#fff">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">
                    <div>${this.renderStatus()}</div>
                    <div>
                        ${canRestart
                ? html`<button style=${buttonStyle} @click=${this.restart}>↺ Restart</button>`
                : html``}
                    </div>
                </div>
                <div style="position:relative;height:340px">
                    <canvas></canvas>
                </div>
                ${this.renderTable()}
            </div>
        `;
    }
}
