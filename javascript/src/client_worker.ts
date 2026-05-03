import { createSumRequest, Envelope, WorkerResponse } from "./messages";
import BenchmarkWorker from './worker.js?worker';

export class WorkerApi {
    private readonly worker: Worker = new BenchmarkWorker();;

    private request_id = 0;
    private responseMap = new Map<number, (...args: any[]) => void>();
    constructor() {
        this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            if (event.data.action === "RESULT") {
                const resolveFn = this.responseMap.get(event.data.id)!;
                this.responseMap.delete(event.data.id);
                resolveFn(event.data.payload)
            }
        }
    }

    private wrapAction(data: Envelope["data"]): { message: Envelope, promise: Promise<unknown> } {
        const req_id = this.request_id++;
        const { resolve, promise } = Promise.withResolvers<number>()
        this.responseMap.set(req_id, resolve);
        return {
            message: {
                requestId: req_id,
                data
            },
            promise
        }
    }

    async sum(a: number, b: number): Promise<number> {
        const { message, promise } = this.wrapAction(createSumRequest(a, b));
        this.worker.postMessage(message);
        const result = await promise;
        return result as number;
    }
}
