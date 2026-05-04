import { Benchmark } from "../../core/benchmark";
import { registerBenchmark } from "../../core/runner";
import { BenchObj, generateObject } from "./shared";

function sum_object_a_b(obj: BenchObj): number {
    return obj.a + obj.b;
}

class JsObjects extends Benchmark {
    id: string = "bench-js-objects";
    generate(N: number): BenchObj[] {
        return Array.from({ length: N }, generateObject);
    }
    run(data: BenchObj[]): void {
        for (let i = 0; i < data.length; i++) {
            const result = sum_object_a_b(data[i]);
            if (result < -1e300) throw new Error("unreachable");
        }
    }
}

registerBenchmark(new JsObjects());
