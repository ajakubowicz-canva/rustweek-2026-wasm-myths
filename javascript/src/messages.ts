

export const CALCULATE_SUM = "ACT_CALC_SUM" as const;
export interface CalculateSumRequest {
    action: typeof CALCULATE_SUM,
    a: number,
    b: number
}

export interface Envelope {
    data: CalculateSumRequest;
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

