import { Benchmark } from "../../core/benchmark";
import { registerBenchmark } from "../../core/runner";
import {
    dot_buffer_a_view,
    dot_buffer_b_view,
    dot_buffers_resize,
    dot_product_simd,
} from "../../../generated_wasm/rustweek_2026_wasm_myths_simd.js";
import { fillRandomFloat32 } from "./shared";

// Note: the SIMD module has its own Wasm memory and therefore its own
// pair of buffers, totally independent of the scalar module. We cache
// views into *this* module's memory.
let cachedN = -1;
let viewA: Float32Array | null = null;
let viewB: Float32Array | null = null;

function ensureBuffers(N: number): { a: Float32Array; b: Float32Array } {
    if (cachedN !== N) {
        dot_buffers_resize(N);
        cachedN = N;
        viewA = null;
        viewB = null;
    }
    if (viewA === null || viewA.byteLength === 0) {
        viewA = dot_buffer_a_view();
    }
    if (viewB === null || viewB.byteLength === 0) {
        viewB = dot_buffer_b_view();
    }
    return { a: viewA, b: viewB };
}

class WasmSimdDotProduct extends Benchmark {
    id: string = "bench-wasm-dot-product-simd";
    private round = 0;

    generate(N: number): number {
        const { a, b } = ensureBuffers(N);
        this.round = (this.round + 1) | 0;
        fillRandomFloat32(a, this.round);
        fillRandomFloat32(b, this.round ^ 0x9e3779b9);
        return N;
    }

    run(N: number): unknown {
        const result = dot_product_simd(N);
        if (Number.isNaN(result)) throw new Error("unreachable");
        return result;
    }
}

registerBenchmark(new WasmSimdDotProduct());
