import { Benchmark } from "../../core/benchmark";
import { registerBenchmark } from "../../core/runner";
import { randomHexColor } from "./shared";

function parseHexColor(hex: string): [number, number, number] {
    return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
    ];
}

class JsHexColor extends Benchmark {
    id: string = "bench-js-hex-color";
    generate(N: number): string[] {
        return Array.from({ length: N }, randomHexColor);
    }
    run(data: string[]): void {
        for (let i = 0; i < data.length; i++) {
            const rgb = parseHexColor(data[i]);
        }
    }
}

registerBenchmark(new JsHexColor());
