
export abstract class Benchmark {
  abstract readonly id: string;
  abstract generate(N: number): unknown;
  abstract run(data: unknown): void;
}
