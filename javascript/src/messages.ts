

export const CALCULATE_SUM = "ACT_CALC_SUM" as const;
export interface CalculateSumRequest {
    action: typeof CALCULATE_SUM,
    a: number,
    b: number
}

export const RUN_BENCHMARKS = "ACT_RUN_BENCHMARKS" as const;

export interface RunBenchmarksRequest {
    action: typeof RUN_BENCHMARKS;
    requests: Array<{ id: string; N: number }>;
}

export function createRunBenchmarksRequest(
    requests: Array<{ id: string; N: number }>
): RunBenchmarksRequest {
    return { action: RUN_BENCHMARKS, requests };
}

export interface Envelope {
    data: CalculateSumRequest | RunBenchmarksRequest;
    requestId: number;
}

export type WorkerRequest = Envelope;

export function createSumRequest(a: number, b: number): CalculateSumRequest {
    return {
        action: CALCULATE_SUM,
        a,
        b
    }
}

export interface WorkerResponse {
    action: "RESULT",
    id: number,
    payload: any,
}

