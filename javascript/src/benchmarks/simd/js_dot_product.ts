import { Benchmark } from "../../core/benchmark";
import { registerBenchmark } from "../../core/runner";
import { fillRandomFloat32 } from "./shared";

interface JsDotData {
    a: Float32Array;
    b: Float32Array;
}

// ANCHOR: js_dot
function jsDotProduct(a: Float32Array, b: Float32Array): number {
    let acc = 0;
    for (let i = 0; i < a.length; i++) {
        acc += a[i] * b[i];
    }
    return acc;
}
// ANCHOR_END: js_dot

class JsDotProduct extends Benchmark {
    id: string = "bench-js-dot-product";
    private cached: JsDotData | null = null;
    private round = 0;

    generate(N: number): JsDotData {
        if (!this.cached || this.cached.a.length !== N) {
            this.cached = { a: new Float32Array(N), b: new Float32Array(N) };
        }
        this.round = (this.round + 1) | 0;
        fillRandomFloat32(this.cached.a, this.round);
        fillRandomFloat32(this.cached.b, this.round ^ 0x9e3779b9);
        return this.cached;
    }

    run(data: JsDotData): unknown {
        const result = jsDotProduct(data.a, data.b);
        if (Number.isNaN(result)) throw new Error("unreachable");
        return result;
    }
}

registerBenchmark(new JsDotProduct());
