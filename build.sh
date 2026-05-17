#!/bin/bash

set -e

# Scalar build
cargo build --release --target wasm32-unknown-unknown
wasm-bindgen --out-dir ./javascript/generated_wasm \
  ./target/wasm32-unknown-unknown/release/rustweek_2026_wasm_myths.wasm \
  --target web

# Simd build into separate module
RUSTFLAGS="-C target-feature=+relaxed-simd" \
  cargo build --release --target wasm32-unknown-unknown \
  --target-dir target_simd
wasm-bindgen --out-dir ./javascript/generated_wasm \
  --out-name rustweek_2026_wasm_myths_simd \
  ./target_simd/wasm32-unknown-unknown/release/rustweek_2026_wasm_myths.wasm \
  --target web

# Threads build into a separate module. Requires nightly Rust + the
# `rust-src` component (so `-Z build-std` can rebuild std with atomics
# support). The `threads` Cargo feature gates the rayon /
# wasm-bindgen-rayon deps so the scalar and SIMD builds above don't pull
# them in.
#
# Output goes into its own subdirectory `generated_wasm/threads/` with
# `--out-name index` so that the `await import('../../..')` resolution
# inside `wasm-bindgen-rayon`'s `workerHelpers.js` lands on
# `generated_wasm/threads/index.js`. Sharing the parent
# `generated_wasm/` dir with the scalar / SIMD artefacts breaks that
# resolution because there is no `index.js` next to the other artefacts.
#
# `+atomics` alone is not enough on recent nightly toolchains — LLD no
# longer flips the memory's `shared` bit just because atomics ops are
# present, so without the explicit `--shared-memory` link-arg the
# emitted wasm has a non-shared memory and `WebAssembly.Memory` fails
# to structured-clone when wasm-bindgen-rayon tries to postMessage it
# to the worker pool. `--max-memory` is required whenever
# `--shared-memory` is set; 2 GB is comfortably above SAXPY's largest
# sweep point (4M f32 × 3 buffers ≈ 48 MB).
RUSTFLAGS="-C target-feature=+atomics,+bulk-memory,+mutable-globals \
  -C link-arg=--shared-memory \
  -C link-arg=--import-memory \
  -C link-arg=--max-memory=2147483648 \
  -C link-arg=--export=__wasm_init_tls \
  -C link-arg=--export=__tls_size \
  -C link-arg=--export=__tls_align \
  -C link-arg=--export=__tls_base" \
  cargo +nightly build --release --target wasm32-unknown-unknown \
  --features threads \
  -Z build-std=panic_abort,std \
  --target-dir target_threads
rm -rf ./javascript/generated_wasm/threads
wasm-bindgen --out-dir ./javascript/generated_wasm/threads \
  --out-name index \
  --target web \
  ./target_threads/wasm32-unknown-unknown/release/rustweek_2026_wasm_myths.wasm