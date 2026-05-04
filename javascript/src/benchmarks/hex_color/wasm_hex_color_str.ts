import { Benchmark } from "../../core/benchmark";
import { registerBenchmark } from "../../core/runner";
import { parse_hex_color_str } from "../../../generated_wasm/rustweek_2026_wasm_myths.js";
import { randomHexColor } from "./shared";

class WasmHexColorStr extends Benchmark {
    id: string = "bench-wasm-hex-color-str";
    generate(N: number): string[] {
        return Array.from({ length: N }, randomHexColor);
    }
    run(data: string[]): void {
        for (let i = 0; i < data.length; i++) {
            const rgb = parse_hex_color_str(data[i]);
        }
    }
}

registerBenchmark(new WasmHexColorStr());
