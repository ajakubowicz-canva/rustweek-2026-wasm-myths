import init, { sum } from "../generated_wasm/rustweek_2026_wasm_myths.js";
import { benchmarkRunner } from "./core/runner.js";

// Side effect register benchmarks
import "./benchmarks/mono_mega/monomorphic.js";
import "./benchmarks/mono_mega/megamorphic.js";
import "./benchmarks/identity/wasm_identity.js";
import "./benchmarks/identity/js_identity.js";
import "./benchmarks/identity/string_identity.js";
import "./benchmarks/hex_color/js_hex_color.js";
import "./benchmarks/hex_color/wasm_hex_color_str.js";

import { type WorkerRequest, CALCULATE_SUM, RUN_BENCHMARKS, WorkerResponse } from './messages.js'

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
    const { requestId, data } = event.data;

    if (data.action === CALCULATE_SUM) {
        const result = sum(data.a, data.b);
        post({ action: "RESULT", id: requestId, payload: result });
    } else if (data.action === RUN_BENCHMARKS) {
        const results = benchmarkRunner.run(data.requests, data.rounds);
        post({ action: "RESULT", id: requestId, payload: results });
    }
};
