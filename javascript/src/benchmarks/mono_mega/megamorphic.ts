import { Benchmark } from "../../core/benchmark";
import { ObjectWithNumbers, sum_fields_mega } from "./shared";
import { registerBenchmark } from "../../core/runner";

// ANCHOR: factories
const objectWithNumbersFactories: Array<(a: number, b: number, c: number, d: number, e: number) => ObjectWithNumbers> = [
    (a, b, c, d, e) => ({ a, b, c, d, e }),
    (a, b, c, d, e) => ({ b, a, c, d, e }),
    (a, b, c, d, e) => ({ c, b, a, d, e }),
    (a, b, c, d, e) => ({ d, c, b, a, e }),
    (a, b, c, d, e) => ({ e, d, c, b, a }),
    (a, b, c, d, e) => ({ a, c, e, b, d }),
    (a, b, c, d, e) => ({ b, d, a, e, c }),
    (a, b, c, d, e) => ({ e, c, a, d, b }),
];
// ANCHOR_END: factories

class Megamorphic extends Benchmark {
    id: string = "bench-megamorphic";
    generate(N: number): ObjectWithNumbers[] {
        return (new Array(N)).fill(null).map(() => objectWithNumbersFactories[Math.floor(Math.random() * objectWithNumbersFactories.length)](Math.random(), Math.random(), Math.random(), Math.random(), Math.random()))
    }
    run(data: ObjectWithNumbers[]): unknown {
        let acc = 0;
        for (let i = 0; i < data.length; i++) {
            acc += sum_fields_mega(data[i]);
        }
        return acc;
    }

}

registerBenchmark(new Megamorphic());
