import { Benchmark } from "../../core/benchmark";
import { registerBenchmark } from "../../core/runner";

function identity(val: unknown): unknown {
    return val;
}

class JsIdentity extends Benchmark {
    id: string = "bench-js-identity";
    generate(N: number): string {
        return "a".repeat(N);
    }
    run(data: string): unknown {
        return identity(data);
    }
}

registerBenchmark(new JsIdentity());
