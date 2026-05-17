# Wasm SIMD: a primitive JavaScript doesn't have

Most of this book is about boundaries: bridge cost, hidden classes, GC
pauses. This appendix is about something simpler — a CPU instruction set
that Wasm can use and JavaScript can't.

WebAssembly's [fixed-width SIMD](https://github.com/WebAssembly/simd)
proposal exposes 128-bit vector registers and lane-wise arithmetic
intrinsics (`f32x4_mul`, `i32x4_add`, `v128_load`, …). They've been
baseline in every major browser since 2023. From Rust we get them as
plain functions in `std::arch::wasm32`.

JavaScript has no equivalent. The original
[SIMD.js proposal](https://tc39.es/ecmascript_simd/) was withdrawn in
favour of "use Wasm SIMD instead", and `Float32Array` loops do **not**
auto-vectorise across float reductions in V8 — IEEE-754 addition isn't
associative, so the engine isn't allowed to re-order `acc += a[i] * b[i]`
into four parallel partial sums.

That makes a four-lane f32 dot product the cleanest possible
demonstration: same arithmetic, same memory access pattern, and the only
real difference between the lines on the chart is whether the runtime is
allowed to stuff four multiplies into a single hardware instruction.

## The workload

Per call: take two `Float32Array`s of length `N`, return
`sum_{i=0..N} a[i] * b[i]`. We sweep `N` from a few thousand to a million.

To keep the chart honest, all three variants are doing the same I/O
pattern:

- The JavaScript variant's arrays live on the JS heap and are filled in
  place each round (no per-round allocation churn).
- Both Wasm variants pre-allocate two `Vec<f32>` of length `N` in their
  respective module's linear memory and expose them as `Float32Array`
  views. JS fills the views directly; the benchmark then calls a single
  Wasm function that reads from those buffers — no per-call data copy
  across the bridge, exactly the
  [pre-allocated buffer pattern](../wasm_bridge_myths/myth_strings.md)
  from the strings myth.

So the duration on the chart is the cost of the loop itself, not bridge
or allocation overhead.

### JavaScript variant

```typescript
{{#include ../../../javascript/src/benchmarks/simd/js_dot_product.ts:js_dot}}
```

### Rust scalar variant (compiled without `+simd128`)

Compiled into the default Wasm artefact, with no `+simd128` and no
`+relaxed-simd`. There are no SIMD lanes for LLVM to vectorise into, and
the float-add reduction would block auto-vectorisation even if there
were. This is genuinely scalar code.

```rust
{{#include ../../../src/wasm_simd_speedup.rs:scalar}}
```

### Rust SIMD variant (compiled with `+relaxed-simd`)

Lives in a second Wasm artefact built with
`RUSTFLAGS="-C target-feature=+relaxed-simd"` (which implies `+simd128`).
The function is gated `#[cfg(target_feature = "simd128")]` so it only
exists in this build — the JS binding for it is exclusive to
`rustweek_2026_wasm_myths_simd.js`.

The body is the canonical four-lane f32 dot product: `v128_load` 16
bytes at a time, `f32x4_mul` lane-wise, accumulate into a `v128`
running sum, horizontally reduce once at the end, and a scalar tail for
any leftover < 4 elements.

```rust
{{#include ../../../src/wasm_simd_speedup.rs:simd}}
```

## The chart

<benchmark-graph-viewer
    benches="'bench-js-dot-product','bench-wasm-dot-product-scalar','bench-wasm-dot-product-simd'"
    labels="'JavaScript (Float32Array loop)','Wasm scalar (no +simd128)','Wasm SIMD (f32x4 intrinsics)'"
    N="4096,16384,65536,262144,1048576"
    x-label="# of f32 elements per call"
    rounds="20">
</benchmark-graph-viewer>

## What you should see

Three lines, all linear in `N`:

- **JavaScript** and **Wasm scalar** sit close together. JS is doing the
  same scalar multiply-accumulate the Wasm scalar version is, and V8's
  TurboFan is genuinely good at that — there's not much for "leaving
  JS" to win on its own at this workload.
- **Wasm SIMD** drops to roughly a quarter of either scalar line. The
  ceiling is `4×` because we're packing four f32 multiplies into one
  `f32x4_mul`; in practice the measured speedup tends to land closer to
  3× once load / store pressure and the horizontal reduce are accounted
  for.

The interesting takeaway isn't the size of the speedup. It's the
**shape**: at this kind of straight-line numeric loop, *just* moving
from JavaScript to scalar Wasm doesn't buy you much. The win comes from
the SIMD lane width, which is something JavaScript can't express at all
in the language. If you're looking for a 3-4× speedup on a hot inner
loop full of float arithmetic — image processing, audio mixing, ML
inference, signed-distance-field rendering — Wasm SIMD is the lever
that's actually worth pulling, and it's the lever that doesn't exist on
the JS side of the bridge.
