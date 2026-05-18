// Naive JS-workers SAXPY variant for the Wasm-threading appendix.
//
// The fan-out side, written the way most JS-workers code in the wild
// is written: per round the worker receives two input chunks plus a
// scalar via `postMessage` (structured-clone memcpy on the way in),
// allocates a fresh output `Float32Array`, runs the per-element loop,
// and posts the output back — also via structured clone (alloc +
// memcpy on the way out). No `Transferable`, no buffer reuse.
//
// This is on purpose: it's the baseline a developer writes when they
// reach for Web Workers for the first time, and it's what the chart's
// `js_workers_clone` line measures. See `saxpy-worker-transfer.ts`
// for the optimised variant that uses Transferable + persistent
// output buffers; the gap between the two lines on the chart is the
// cost of the structured-clone memcpys, separate from postMessage's
// own round-trip overhead.

declare const self: DedicatedWorkerGlobalScope;

interface SaxpyCloneRequest {
    requestId: number;
    a: number;
    x: Float32Array;
    y: Float32Array;
}

interface SaxpyCloneResponse {
    requestId: number;
    output: Float32Array;
}

// ANCHOR: js_worker_body_clone
self.onmessage = (event: MessageEvent<SaxpyCloneRequest>) => {
    const { requestId, a, x, y } = event.data;
    const n = x.length;
    const output = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        output[i] = a * x[i] + y[i];
    }
    const response: SaxpyCloneResponse = { requestId, output };
    self.postMessage(response);
};
// ANCHOR_END: js_worker_body_clone

export {};
