# GC jitter: how JS GC breaks predictable performance

Throughput benchmarks are kind to JavaScript: amortised across thousands of
calls, V8's garbage collector is fast enough that average numbers look
reasonable. Interactive workloads — drag handles, typing, scrolling, animation —
do not run on averages. They live and die by their **worst-case frame**, and
that is where the JavaScript GC quietly turns a fast computation into a
visible stutter.

This appendix is a live demonstration of that effect. Two phases run
back-to-back on the main thread: a JavaScript phase that allocates plain
objects on the JS heap, and a Wasm phase that does the identical arithmetic
against records living in Wasm linear memory. Both are timed call-by-call,
and we sample `performance.memory.usedJSHeapSize` after each call so you can
watch the JS heap saw and collapse during the JS phase, then sit perfectly
flat during the Wasm phase.

> **Why serial phases on the main thread?** `performance.memory` is only
> exposed on the `Window` realm in current browsers — it is **not** present
> on `DedicatedWorkerGlobalScope`. The variants therefore have to run on
> the main thread so their allocations land on the heap we can actually
> measure. They run one after the other (JS first, then Wasm) so the heap
> baseline of one phase is never polluted by the other.

## The workload

A flat array of records is the wrong workload to expose this — V8's
nursery is _spectacularly_ fast at bump-allocating small objects with a
stable hidden class, and the Rust port has to pay for `String` allocation
and bookkeeping inside the wasm allocator on every element. Throughput
ends up roughly tied, and on Chrome the JS path can even win.

What turns the picture upside down is **shape**: a deeply nested,
pointer-heavy graph. We build a balanced N-ary tree per call:

- Per call: a balanced 4-ary tree of depth 8. That's 87,381 nodes
  (`(4^9 − 1) / (4 − 1)`) plus an array per non-leaf node.
- Sum every node's value via a recursive walk. This is the work — and
  it is identical between JS and Wasm.
- Push the resulting tree onto a rolling retention buffer of length 30,
  so the working set is ~2.6M live nodes at steady state.

Why this shape exposes the GC:

- **JS allocations per tree are ~8× higher than in Rust.** Every node is
  one heap-allocated object _and_ its `children` field is a separately
  heap-allocated array. In Rust only the non-leaf `Vec`s allocate; leaves
  carry an empty `Vec` that doesn't touch the heap.
- **JS's mark phase is linear in live, reachable objects.** Every retained
  node + every children-array is a pointer V8 has to chase during a major
  GC. Rust drops a tree by walking it once when it falls off the
  retention buffer — there is no tracing, no stop-the-world.

### JavaScript variant

Plain `{ value, children }` objects on the JS heap. The GC owns the graph.

```typescript
{{#include ../../../javascript/src/core/gc-jitter-viewer.ts:js_alloc}}
```

### Rust → Wasm variant

`TreeNode` records linked through `Vec`s in Wasm linear memory. Memory is
freed deterministically as the `VecDeque` rolls — no GC, no stop-the-world.

```rust
{{#include ../../../src/wasm_gc_jitter.rs:wasm_alloc}}
```

## What you should see

- **Top chart (per-call work time, ms).** The Wasm half stays close to a
  flat band. The JS half bobs around the same baseline most of the time, but
  is regularly punched upward by tall spikes — those are major GC pauses
  landing on the same call as your compute. The p99 row in the table
  underneath is the headline number: this is what your worst-case interaction
  feels like.
- **Bottom chart (heap MB).** The JS half climbs in a sawtooth — a slow ramp
  as the retention buffer fills, then a sharp drop every time a major GC
  cycle completes. Each drop on the heap chart lines up with a spike on the
  work-time chart above. The Wasm half stays almost flat: its allocations
  live in Wasm linear memory, which `performance.memory` doesn't see at all,
  and the JS heap on the main thread is barely touched.

`performance.memory` is a Chromium-only API. In Firefox and Safari the heap
chart will stay empty, but the work-time chart still tells the same story.

The two phases are run sequentially. Between them the page waits for any
in-flight major GC to finish and drops both retention buffers, so the Wasm
phase doesn't inherit the JS phase's old-generation footprint.

<gc-jitter-viewer></gc-jitter-viewer>

## Why this matters

Throughput says "JavaScript is roughly as fast as Wasm at this workload".
The p99 column says something very different. When you move a hot,
allocation-heavy code path from JavaScript to Rust → Wasm, the headline win
is rarely a 10× speedup on the mean. It's that the **tail collapses**: your
worst case becomes your typical case, because you stopped sharing a heap
with a non-deterministic collector.
