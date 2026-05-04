import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend } from "chart.js";
import { WorkerApi } from "../client_worker";
import type { BenchmarkResult } from "./runner";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend);

const COLORS = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2"];

@customElement("benchmark-graph-viewer")
class BenchmarkGraphViewer extends LitElement {
    @property({ type: String }) accessor benches = "";
    @property({ type: String }) accessor labels = "";
    @property({ type: String }) accessor N = "";
    @property({ type: String, attribute: "x-label" }) accessor xLabel = "N (objects)";
    @property({ type: Number }) accessor rounds = 50;

    @state() private accessor results: Map<string, { N: number; duration: number }[]> | null = null;
    @state() private accessor loading = false;

    private chart: Chart | null = null;
    private worker = new WorkerApi();
    private observer: IntersectionObserver | null = null;

    override createRenderRoot() {
        // Block shadow DOM which is a necessary workaround for Chart.js to work easily.
        return this;
    }

    override connectedCallback() {
        super.connectedCallback();
        this.observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) {
                this.observer!.disconnect();
                this.observer = null;
                this.runBenchmarks();
            }
        });
        this.observer.observe(this);
    }

    override disconnectedCallback(): void {
        super.disconnectedCallback();
        this.observer?.disconnect();
        this.observer = null;
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }

    private parseBenches(): string[] {
        return this.benches.split(",").map(s => s.trim().replace(/^'|'$/g, "")).filter(Boolean);
    }

    private parseLabels(benchIds: string[]): string[] {
        const parsed = this.labels.split(",").map(s => s.trim().replace(/^'|'$/g, ""));
        return benchIds.map((id, i) => parsed[i] || id);
    }

    private parseN(): number[] {
        return this.N.split(",").map(Number).filter(n => !isNaN(n));
    }

    private async runBenchmarks() {
        const benchIds = this.parseBenches();
        const nValues = this.parseN();
        if (benchIds.length === 0 || nValues.length === 0) return;

        this.loading = true;
        const data = new Map<string, { N: number; duration: number }[]>();
        for (const id of benchIds) data.set(id, []);

        for (const n of nValues) {
            const batchResults: BenchmarkResult[] = await this.worker.runBenchmarks(
                benchIds.map(id => ({ id, N: n })),
                this.rounds
            );
            for (const r of batchResults) {
                data.get(r.id)!.push({ N: r.N, duration: r.duration });
            }
        }

        this.loading = false;
        this.results = data;
    }

    override updated() {
        if (!this.results) return;
        const canvas = this.querySelector<HTMLCanvasElement>("canvas");
        if (!canvas) return;

        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }

        const nValues = this.parseN();
        const benchIds = [...this.results.keys()];
        const benchLabels = this.parseLabels(benchIds);

        this.chart = new Chart(canvas, {
            type: "line",
            data: {
                labels: nValues,
                datasets: benchIds.map((id, i) => ({
                    label: benchLabels[i],
                    data: this.results!.get(id)!.map(r => r.duration),
                    borderColor: COLORS[i % COLORS.length],
                    backgroundColor: "transparent",
                    tension: 0.1,
                })),
            },
            options: {
                scales: {
                    x: {
                        type: "linear",
                        title: { display: true, text: this.xLabel },
                    },
                    y: {
                        title: { display: true, text: "avg duration (ms)" },
                    },
                },
            },
        });
    }

    private restart() {
        this.results = null;
        this.runBenchmarks();
    }

    render() {
        return html`
            <div style="position:relative;min-height:375px">
                <canvas></canvas>
                ${this.loading ? html`
                    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.75)">
                        <p>Running benchmarks…</p>
                    </div>
                ` : html``}
                ${this.results ? html`
                    <button
                        @click=${this.restart}
                        style="position:absolute;top:8px;right:8px;padding:4px 10px;cursor:pointer;border:1px solid #ccc;border-radius:4px;background:#fff;font-size:0.85em"
                    >↺ Restart</button>
                ` : html``}
            </div>
        `;
    }
}
