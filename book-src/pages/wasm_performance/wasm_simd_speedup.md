# Wasm SIMD: a primitive JavaScript doesn't have

WebAssembly's [fixed-width SIMD](https://github.com/WebAssembly/simd) proposal exposes 128-bit vector registers and lane-wise arithmetic intrinsics (`f32x4_mul`, `i32x4_add`, `v128_load`, …). They've been baseline in every major browser since 2023. From Rust we get them as plain functions in `std::arch::wasm32`.

JavaScript has no equivalent. The original [SIMD.js proposal](https://tc39.es/ecmascript_simd/) was withdrawn in favour of "use Wasm SIMD instead".

Wasm SIMD can be critical to providing maximum performance to users.

## The workload

Per call:

- take two `Float32Array`s of length `N`
- return `sum_{i=0..N} a[i] * b[i]`

To keep the chart honest, all three variants are doing the same I/O
pattern:

- The JavaScript variant's arrays live on the JS heap and are filled in
  place each round (no per-round allocation churn).
- Both Wasm variants pre-allocate two `Vec<f32>` of length `N` in their
  respective module's linear memory and expose them as `Float32Array`
  views. This emulates the
  [pre-allocated buffer pattern](../wasm_bridge_myths/myth_strings.md).

So the duration on the chart is the cost of the loop itself, not bridge
or allocation overhead.

### JavaScript variant

```typescript
{{#include ../../../javascript/src/benchmarks/simd/js_dot_product.ts:js_dot}}
```

### Rust scalar variant (compiled without `+simd128`)

```rust
{{#include ../../../src/wasm_simd_speedup.rs:scalar}}
```

### Rust SIMD variant (compiled with `+relaxed-simd`)

`v128_load` 16 bytes at a time, `f32x4_mul` lane-wise, accumulate into a `v128` running sum, horizontally reduce once at the end, and a scalar tail for any leftover < 4 elements.

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
  same scalar multiply-accumulate the Wasm scalar version is.
- **Wasm SIMD** drops to roughly a quarter of either scalar line. The
  ceiling is `4×` because we're packing four f32 multiplies into one
  `f32x4_mul`.

The interesting takeaway isn't the size of the speedup. It's the **shape**: at this kind of straight-line numeric loop, _just_ moving from JavaScript to scalar Wasm doesn't buy you much. The win comes from Wasm SIMD, which is something JavaScript can't express at all.
