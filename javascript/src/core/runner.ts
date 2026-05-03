import { Benchmark } from "./benchmark";

export interface BenchmarkRequest {
    id: string;
    N: number;
};

export interface BenchmarkResult {
    id: string;
    N: number;
    duration: number;
};

// Using a symbol allows a public field to be effectively private outside this module.
const registerBenchmarkFn = Symbol();

class BenchmarkRunner {
    private readonly benchmarks = new Map<string, Benchmark>();

    [registerBenchmarkFn](benchmark: Benchmark): void {
        if (this.benchmarks.has(benchmark.id)) {
            throw new Error(`Benchmark id must be unique, already registered '${benchmark.id}'.`);
        }
        this.benchmarks.set(benchmark.id, benchmark);
    }

    run(requests: BenchmarkRequest[]): BenchmarkResult[] {
        const ROUNDS = 50;
        const totals = new Map<string, number>();

        for (const { id } of requests) {
            totals.set(id, 0);
        }

        for (let round = 0; round < ROUNDS; round++) {
            for (const { id, N } of requests) {
                const bench = this.benchmarks.get(id)!;
                const data = bench.generate(N);
                const start = performance.now();
                bench.run(data);
                totals.set(id, totals.get(id)! + (performance.now() - start));
            }
        }

        return requests.map(({ id, N }) => ({
            id,
            N,
            duration: totals.get(id)! / ROUNDS,
        }));
    }
}

export const benchmarkRunner = new BenchmarkRunner();

export function registerBenchmark(benchmark: Benchmark) {
    benchmarkRunner[registerBenchmarkFn](benchmark);
}

