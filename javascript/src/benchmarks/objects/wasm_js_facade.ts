import { Benchmark } from "../../core/benchmark";
import { registerBenchmark } from "../../core/runner";
import { sum } from "../../../generated_wasm/rustweek_2026_wasm_myths.js";
import { BenchObj, generateObject } from "./shared";

function sum_object_facade(obj: BenchObj): number {
    return sum(obj.a, obj.b)
}

class WasmExternGetters extends Benchmark {
    id: string = "bench-wasm-objects-js-facade";
    generate(N: number): BenchObj[] {
        return Array.from({ length: N }, generateObject);
    }
    run(data: BenchObj[]): void {
        for (let i = 0; i < data.length; i++) {
            const result = sum_object_facade(data[i]);
            if (result < -1e300) throw new Error("unreachable");
        }
    }
}

registerBenchmark(new WasmExternGetters());
