import { Benchmark } from "../../core/benchmark";
import { registerBenchmark } from "../../core/runner";
import {
    get_hex_buffer_view,
    parse_hex_color_no_alloc
} from "../../../generated_wasm/rustweek_2026_wasm_myths.js";
import { randomHexColor } from "./shared";

let view: Uint8Array<ArrayBufferLike> | undefined = undefined;
function parseHexColor(hex: string): [number, number, number] {
    // Safety: refresh the view if Wasm memory grew so prior memory is detached.
    if (view === undefined || view.byteLength === 0) {
        view = get_hex_buffer_view();
    }
    for (let j = 0; j < 7; j++) {
        view[j] = hex.charCodeAt(j);
    }
    const colorInt = parse_hex_color_no_alloc();
    return [
        (colorInt >> 16) & 255, // R
        (colorInt >> 8) & 255,  // G
        colorInt & 255          // B
    ];
}

class WasmHexColorOptimized extends Benchmark {
    id: string = "bench-wasm-hex-color-no-alloc";

    generate(N: number): string[] {
        return Array.from({ length: N }, randomHexColor);
    }

    run(data: string[]): void {
        for (let i = 0; i < data.length; i++) {
            const rgb = parseHexColor(data[i]);
            if (rgb == null) throw new Error("unreachable");
        }
    }
}

registerBenchmark(new WasmHexColorOptimized());