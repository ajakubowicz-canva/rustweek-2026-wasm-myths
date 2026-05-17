// Helpers shared by the dot-product benchmarks. All three variants
// (`bench-js-dot-product`, `bench-wasm-dot-product-scalar`,
// `bench-wasm-dot-product-simd`) need the same kind of input data — two
// arrays of length N filled with deterministic-looking but seed-varying
// floats — so the dot product itself is the only difference between
// runs.

export function fillRandomFloat32(view: Float32Array, seed: number): void {
    // Cheap LCG so we don't hammer Math.random() inside `generate`. The
    // exact distribution doesn't matter; we just want non-zero, non-equal
    // values across rounds so the optimiser can't fold the work away.
    let s = (seed | 0) || 1;
    for (let i = 0; i < view.length; i++) {
        s = (s * 1664525 + 1013904223) | 0;
        view[i] = ((s >>> 8) & 0xffff) / 0xffff - 0.5;
    }
}
