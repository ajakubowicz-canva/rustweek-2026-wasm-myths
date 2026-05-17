// JS-workers SAXPY variant for the Wasm-threading appendix.
//
// Each worker in the pool persists for the lifetime of the viewer; per
// round it receives two input chunks plus a scalar via `postMessage`,
// runs the per-element loop, allocates a fresh output `Float32Array`,
// and posts that back. **No `Transferable` is used on either side** —
// that's deliberate. The whole point of the page is to expose the
// structured-clone (memcpy + alloc) cost that Wasm threads avoid by
// sharing linear memory; switching to `transfer` would silently shred
// that cost and the chart would no longer match the narrative.

declare const self: DedicatedWorkerGlobalScope;

interface SaxpyRequest {
    requestId: number;
    a: number;
    x: Float32Array;
    y: Float32Array;
}

interface SaxpyResponse {
    requestId: number;
    output: Float32Array;
}

// ANCHOR: js_worker_body
self.onmessage = (event: MessageEvent<SaxpyRequest>) => {
    const { requestId, a, x, y } = event.data;
    const n = x.length;
    const output = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        output[i] = a * x[i] + y[i];
    }
    const response: SaxpyResponse = { requestId, output };
    self.postMessage(response);
};
// ANCHOR_END: js_worker_body

export {};
