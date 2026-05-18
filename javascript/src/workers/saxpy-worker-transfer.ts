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

export { };
