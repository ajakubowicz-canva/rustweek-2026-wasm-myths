import init, { sum } from "../generated_wasm/rustweek_2026_wasm_myths.js";

import { type WorkerRequest, CALCULATE_SUM, WorkerResponse } from './messages.js'

declare const self: DedicatedWorkerGlobalScope;

// Start initializing Wasm immediately when the worker loads
let wasmLoaded = false;
const wasmReady = init().then(() => {
    wasmLoaded = true;
});

function post(response: WorkerResponse) {
    self.postMessage(response);

}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    if (!wasmLoaded) {
        await wasmReady;
    }
    const { requestId, data: { action, ...args } } = event.data;

    if (action === CALCULATE_SUM) {
        const { a, b } = args;
        const result = sum(a, b);
        post({
            action: "RESULT",
            id: requestId,
            payload: result
        })
    }
};