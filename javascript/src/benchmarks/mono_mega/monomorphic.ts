import { Benchmark } from "../../core/benchmark";
import { registerBenchmark } from "../../core/runner";
import { ObjectWithNumbers, sum_fields_mono } from "./shared";

// ANCHOR: factory
const objectWithNumbersFactory = (a: number, b: number, c: number, d: number, e: number) => ({ a, b, c, d, e });
// ANCHOR_END: factory

class Monomorphic extends Benchmark {
    id: string = "bench-monomorphic";
    generate(N: number): ObjectWithNumbers[] {
        return (new Array(N)).fill(null).map(() => objectWithNumbersFactory(Math.random(), Math.random(), Math.random(), Math.random(), Math.random()))
    }
    run(data: ObjectWithNumbers[]): unknown {
        let acc = 0;
        for (let i = 0; i < data.length; i++) {
            acc += sum_fields_mono(data[i]);
        }
        return acc;
    }

}

registerBenchmark(new Monomorphic());
