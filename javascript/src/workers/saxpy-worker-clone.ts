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

export { };
