import { Benchmark } from "../../core/benchmark";
import { registerBenchmark } from "../../core/runner";
import { parse_hex_color_str } from "../../../generated_wasm/rustweek_2026_wasm_myths.js";

function randomHexColor(): string {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

class WasmHexColorStr extends Benchmark {
    id: string = "bench-wasm-hex-color-str";
    generate(N: number): string[] {
        return Array.from({ length: N }, randomHexColor);
    }
    run(data: string[]): unknown {
        let acc = 0;
        for (let i = 0; i < data.length; i++) {
            const rgb = parse_hex_color_str(data[i]);
            acc += rgb[0] + rgb[1] + rgb[2];
        }
        return acc;
    }
}

registerBenchmark(new WasmHexColorStr());
