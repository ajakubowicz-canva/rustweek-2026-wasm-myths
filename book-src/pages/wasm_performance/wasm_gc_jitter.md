# GC jitter: how JS GC breaks predictable performance

This section shows how JavaScript's garbage collection can negatively impact predictable performance.

## The workload

A deeply nested, pointer-heavy graph that tries to emulate some real world application state that is used to, per call:

- Build the tree.
- Sum every node's value via a recursive walk.
- Push the resulting tree onto a rolling retention buffer.

### JavaScript variant

Plain `{ value, children }` objects on the JS heap. The GC owns the graph.

```typescript
{{#include ../../../javascript/src/core/gc-jitter-viewer.ts:js_alloc}}
```

### Rust → Wasm variant

`TreeNode` records linked through `Vec`s in Wasm linear memory. Memory is
freed deterministically in the `VecDeque`.

```rust
{{#include ../../../src/wasm_gc_jitter.rs:wasm_alloc}}
```

## What you should see


- **Top chart (per-call work time, ms).** The JS half bobs around the same baseline most of the time, but
  sees regular spikes. The Wasm half stays close to a flat band. 
- **Bottom chart (heap MB).** The JS half climbs in a sawtooth pattern. A slow ramp occurs
  as memory fills, then a sharp drop every time a major GC
  cycle completes. Each drop on the heap chart lines up with a spike on the
  work-time chart above. The Wasm half stays almost flat.

`performance.memory` is a Chromium-only API. In Firefox and Safari the heap
chart will stay empty.

<gc-jitter-viewer></gc-jitter-viewer>

## Analysis

Rust + Wasm do not require garbage collection. Memory is freed deterministically and, unlike JavaScript, do not accumulate into a single moment that can cause a dropped frame.
