# Wasm threading: parallel without paying postMessage

The saving grace of low-tier devices is that they're multithreaded. Wasm
takes better advantage of that than JavaScript does.

In Rust + Wasm with `wasm-bindgen-rayon`, every thread is a Web Worker
spawned over the *same* `WebAssembly.Memory`. A `&[f32]` passed to
`rayon::par_iter_mut` is a pointer into shared linear memory; every
worker thread can read and write it directly. There is no copy. Standard
library `std::sync::Mutex`, `RwLock`, MPSC channels, atomics all
just work.

In JavaScript, the equivalent fan-out is `postMessage` to a pool of Web
Workers and there are two flavours of it shown the below benchmarks (structural
cloning and trying as much as possible to minimise copy).

## The workload

The lightest meaningful parallel map: SAXPY, `out[i] = a * x[i] + y[i]`. Per element it's one f32 multiply + one f32 add. It's a simple operation where we aim to measure message overhead rather than computation speed.

We test 5 variants, as detailed below:

### 1. JavaScript variant (single-threaded)

A baseline comparison that simply executes everything on one thread.

```typescript
const n = x.length;
for (let i = 0; i < n; i++) {
    output[i] = a * x[i] + y[i];
}
```

### 2. JavaScript worker (structured clone)

A persistent pool of `K = navigator.hardwareConcurrency` (capped at 8) workers. 

Each call, we:
  - `postMessage` `{x_chunk, y_chunk, a}` to each worker (structured-clone
  alloc + memcpy).
  - the worker performs the computation.
  - the worker allocates an output `Float32Array`.
  - the worker posts it back.
  - the main thread glues the `K` output chunks together.

```typescript
{{#include ../../../javascript/src/workers/saxpy-worker-clone.ts:js_worker_body_clone}}
```

### 3. JavaScript worker (transferables)

The same as the structured clone version but where no allocations occur
and we take advantage of transferables.

```typescript
{{#include ../../../javascript/src/workers/saxpy-worker-transfer.ts:js_worker_body_transfer}}
```

### 4. Rust scalar single threaded

The same as 1 but entirely in Wasm.

```rust
{{#include ../../../src/wasm_threading.rs:scalar}}
```

### 5. Rust parallel (Rayon + Atomics)

We perform multithreading using the Shared Array Buffer and Atomics Web API.
Zero bytes cross any boundary and the buffers live where the threads can already access them.


```rust
{{#include ../../../src/wasm_threading.rs:parallel}}
```

## The chart

<wasm-threading-viewer></wasm-threading-viewer>

## Analysis

Wasm threading sees the best performance because message overhead is totally eliminated using Wasm threading. Rayon efficiently dispatches the batches of work to available threads who operate over the same memory.


## What about `SharedArrayBuffer` + `Atomics` in JavaScript?

Yes, you can have shared memory in pure JavaScript. The cost is that
you stop writing JavaScript and start writing a byte-level protocol.