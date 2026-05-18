// Fair JS-workers SAXPY variant for the Wasm-threading appendix.
//
// The fan-out side, but optimised: every input and output buffer is
// owned by a pre-allocated `Float32Array` on the main thread that gets
// `Transferable`'d into the worker on the way in, computed into in
// place, and `Transferable`'d back out on the way back. Zero copies on
// the wire; zero allocations per call inside the worker.
//
// What's left is the postMessage round-trip itself — a JS event-loop
// scheduling event in each direction, K times per call. That's the
// cost we want this variant to expose, in contrast to the naive
// `saxpy-worker-clone.ts` (whose cost is structured-clone memcpy on
// top of the same RTT).

declare const self: DedicatedWorkerGlobalScope;

interface SaxpyTransferRequest {
    requestId: number;
    a: number;
    x: Float32Array;
    y: Float32Array;
    output: Float32Array;
}

interface SaxpyTransferResponse {
    requestId: number;
    x: Float32Array;
    y: Float32Array;
    output: Float32Array;
}

// ANCHOR: js_worker_body_transfer
self.onmessage = (event: MessageEvent<SaxpyTransferRequest>) => {
    const { requestId, a, x, y, output } = event.data;
    const n = x.length;
    for (let i = 0; i < n; i++) {
        output[i] = a * x[i] + y[i];
    }
    const response: SaxpyTransferResponse = { requestId, x, y, output };
    self.postMessage(response, [x.buffer, y.buffer, output.buffer]);
};
// ANCHOR_END: js_worker_body_transfer

export {};
