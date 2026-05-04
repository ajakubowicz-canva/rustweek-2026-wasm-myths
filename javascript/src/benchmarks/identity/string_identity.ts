import { Benchmark } from "../../core/benchmark";
import { registerBenchmark } from "../../core/runner";
import { expensive_string_identity } from "../../../generated_wasm/rustweek_2026_wasm_myths.js";

class WasmStringIdentity extends Benchmark {
    id: string = "bench-wasm-string-identity";
    generate(N: number): string {
        return "a".repeat(N);
    }
    run(data: string): unknown {
        const result = expensive_string_identity(data);
        if (result == null) throw new Error("unreachable");
        return result;
    }
}

registerBenchmark(new WasmStringIdentity());
