# Wasm threading: parallel without paying postMessage

The saving grace of low-tier devices is that they're multithreaded. Wasm
takes better advantage of that than JavaScript does — not because the
arithmetic is faster (we covered that in the
[SIMD appendix](./wasm_simd_speedup.md); for plain scalar work, JS and
Wasm are roughly tied), but because the *boundary* between threads is
free.

In Rust → Wasm with `wasm-bindgen-rayon`, every thread is a Web Worker
spawned over the *same* `WebAssembly.Memory`. A `&[f32]` passed to
`rayon::par_iter_mut` is a pointer into shared linear memory; every
worker thread can read and write it directly. There is no copy. Standard
library `std::sync::Mutex`, `RwLock`, MPSC channels, atomics — they all
just work, over real Rust types.

In JavaScript, the equivalent fan-out is `postMessage` to a pool of Web
Workers. Every call structured-clones the input typed arrays (an alloc +
memcpy), the worker gets a *fresh* `Float32Array` over a *fresh*
`ArrayBuffer`, computes, allocates an output, and structured-clones it
back. Two copies on the way in, one on the way out, per call.

You can avoid the copy with `SharedArrayBuffer` + `Atomics`, and we'll
come back to that. But you can't avoid the price of working over raw
bytes: there is no `Mutex<MyStruct>`, no `mpsc::channel()`, no
`Arc<RwLock<Vec<Record>>>`. You get `Atomics.add(view, i, x)` and
`Atomics.wait(view, i, expected)` over an `Int32Array` — a hand-encoded
shared memory protocol, on you to keep right.

## The workload

The lightest meaningful parallel map: SAXPY,
`out[i] = a * x[i] + y[i]`. Per element it's one f32 multiply + one f32
add — so cheap that on the JS-workers side, the structured-clone of the
three buffers (two inputs in, one output back) dominates the work
itself. That's the whole point: this appendix is about postMessage's
I/O cost, not whose arithmetic is faster.

Four lines on the chart, all running the same arithmetic:

- **JavaScript single-threaded** — straight `for` loop on the main
  thread. The honest baseline for the JS column.
- **JavaScript web workers + postMessage** — a persistent pool of
  `K = navigator.hardwareConcurrency` (capped at 8) workers. Each call:
  refill the per-worker chunk buffers, `postMessage` `{x_chunk, y_chunk, a}`
  to each worker, await `K` replies, glue the output chunks together.
  Structured clone, no `Transferable`, no `SharedArrayBuffer`.
- **Wasm single-threaded** — same SAXPY, just one main thread. Same
  shared linear memory as the threaded variant, no rayon involved.
- **Wasm rayon threads** — `par_iter_mut().zip(par_iter()).zip(par_iter())`
  over `Float32Array` views into shared linear memory. Same `K` thread
  pool. Zero bytes cross any boundary; the buffers live where the
  threads can already see them.

### JavaScript variant (single-threaded)

```typescript
const n = x.length;
for (let i = 0; i < n; i++) {
    output[i] = a * x[i] + y[i];
}
```

### JavaScript worker body

The fan-out side. The worker receives chunks via structured clone,
allocates a fresh output, computes, posts the output back — also via
structured clone. No `Transferable` on either side, on purpose.

```typescript
{{#include ../../../javascript/src/workers/saxpy-worker.ts:js_worker_body}}
```

### Rust scalar variant

Lives in the `+atomics +bulk-memory` artefact for symmetry — both Wasm
variants share the same buffers in linear memory, so we measure the
exact same loop without confusing the picture by mixing artefacts.

```rust
{{#include ../../../src/wasm_threading.rs:scalar}}
```

### Rust parallel variant

```rust
{{#include ../../../src/wasm_threading.rs:parallel}}
```

Three things to notice in this Rust snippet that the JS-workers code
above can't express:

- **No bytes leave linear memory.** `x`, `y`, and `out` are slices into
  the shared `WebAssembly.Memory` that every rayon worker is already
  attached to.
- **No `Mutex` is needed.** `par_iter_mut` proves the lanes are
  disjoint; the borrow checker rejects any code that would race.
- **The data is real Rust.** Here it's a flat `&[f32]`, but if it were
  a `&Mutex<HashMap<String, Record>>`, every thread would just *use* it.
  No serialisation, no encoding, no lock-bit-twiddling on a
  `Uint32Array`.

## What about `SharedArrayBuffer` + `Atomics`?

Yes, you can have shared memory in pure JavaScript. The cost is that
you stop writing JavaScript and start writing a byte-level protocol:

```typescript
const buffer = new SharedArrayBuffer(N * 4);
const view = new Int32Array(buffer);

// "Acquire" a record. You define what that means.
Atomics.store(view, recordOffset + STATE, STATE_LOCKED);
Atomics.notify(view, recordOffset + STATE, 1);

// Mutate fields by writing scalars into the right slots, by hand,
// in the layout you've designed.
Atomics.store(view, recordOffset + FIELD_VALUE, newValue);

// "Release" it.
Atomics.store(view, recordOffset + STATE, STATE_FREE);
```

There is no `Mutex<Record>`. There is no `Vec<Record>`. There is one
flat byte buffer and a layout in your head — or, more honestly, in a
constants file you keep up to date by hand. Compare to:

```rust
let records: Arc<Mutex<Vec<Record>>> = ...;
records.lock().unwrap().push(record);
```

Both descriptions of "a shared mutable list of records" do the same
thing on the same hardware. Only one of them is the language you're
writing the rest of the program in.

## The chart

<wasm-threading-viewer></wasm-threading-viewer>

## What you should see

- **JS workers + postMessage** is the slowest line at every N — usually
  by a wide margin. That's the postMessage cost dominating: per call we
  structured-clone three buffers totalling `12 N` bytes, and SAXPY's
  per-element work is so cheap (~1 ns/elem) that the clone is the work.
  The line often climbs *above* JS single-threaded, meaning the parallel
  fan-out is a net pessimisation at this workload — exactly the trap a
  developer falls into when reaching for Web Workers without realising
  the boundary cost.
- **JS single-threaded** is the JavaScript honesty floor. V8's TurboFan
  is genuinely good at scalar f32 SAXPY; this line tracks the Wasm
  scalar line closely. Confirms that "Wasm is faster than JS" isn't
  what's happening on the threading line — it's the *boundary* that
  matters, not the per-instruction speed.
- **Wasm single-threaded** sits next to JS single-threaded. Same loop,
  same memory bandwidth, same answer.
- **Wasm rayon threads** is the bottom line. The speedup over Wasm
  scalar is *sub-linear* in `K` because SAXPY at this scale is
  memory-bandwidth-bound, not compute-bound — even with 8 cores, the
  RAM controller is the bottleneck and you'll commonly see a 2–4×
  improvement, not 8×. The headline number isn't the scalar-vs-threads
  ratio; it's the gap between this line and the JS-workers line, which
  is typically 10–50× depending on `N`.

The takeaway: **the boundary cost is the cost**. JavaScript can run
loops fast and JavaScript can spawn workers, but sticking those two
together means paying for an alloc + memcpy on every byte that enters
or leaves a worker, and that's the cost a real-world parallel pipeline
spends most of its time on. Rust → Wasm with shared linear memory
sidesteps it by construction. The threads don't have a boundary to
cross because everything they see is already on their side of it.

## Why this needs cross-origin isolation

`SharedArrayBuffer` and Wasm threads both need the page to be
[cross-origin isolated](https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated).
That requires the server to send `Cross-Origin-Opener-Policy: same-origin`
and `Cross-Origin-Embedder-Policy: require-corp` headers. GitHub Pages
won't let us set headers, so this site ships a tiny service-worker shim
([`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker))
that intercepts every request from the main thread and adds those
headers as if they came from the server. On first visit the SW installs
and the page reloads itself once into a cross-origin-isolated context.
From then on, `crossOriginIsolated` is `true` and the chart above runs.
If your browser doesn't support service workers, or you've disabled
them, the chart will tell you and skip the threaded variants.
