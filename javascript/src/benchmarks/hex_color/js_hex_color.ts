import { Benchmark } from "../../core/benchmark";
import { registerBenchmark } from "../../core/runner";

function parseHexColor(hex: string): [number, number, number] {
    return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
    ];
}

function randomHexColor(): string {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

class JsHexColor extends Benchmark {
    id: string = "bench-js-hex-color";
    generate(N: number): string[] {
        return Array.from({ length: N }, randomHexColor);
    }
    run(data: string[]): unknown {
        let acc = 0;
        for (let i = 0; i < data.length; i++) {
            const [r, g, b] = parseHexColor(data[i]);
            acc += r + g + b;
        }
        return acc;
    }
}

registerBenchmark(new JsHexColor());
