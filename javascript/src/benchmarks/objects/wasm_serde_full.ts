import { Benchmark } from "../../core/benchmark";
import { registerBenchmark } from "../../core/runner";
import { sum_ab_serde } from "../../../generated_wasm/rustweek_2026_wasm_myths.js";
import { BenchObj, generateObject } from "./shared";

class WasmSerdeFull extends Benchmark {
    id: string = "bench-wasm-objects-serde";
    generate(N: number): BenchObj[] {
        return Array.from({ length: N }, generateObject);
    }
    run(data: BenchObj[]): void {
        for (let i = 0; i < data.length; i++) {
            const result = sum_ab_serde(data[i]);
            if (result < -1e300) throw new Error("unreachable");
        }
    }
}

registerBenchmark(new WasmSerdeFull());
