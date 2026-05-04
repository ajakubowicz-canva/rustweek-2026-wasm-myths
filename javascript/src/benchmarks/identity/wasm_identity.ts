import { Benchmark } from "../../core/benchmark";
import { registerBenchmark } from "../../core/runner";
import { identity } from "../../../generated_wasm/rustweek_2026_wasm_myths.js";

class WasmIdentity extends Benchmark {
    id: string = "bench-wasm-identity";
    generate(N: number): string {
        return "a".repeat(N);
    }
    run(data: string): unknown {
        const result = identity(data);
        if (result == null) throw new Error("unreachable");
        return result;
    }
}

registerBenchmark(new WasmIdentity());
