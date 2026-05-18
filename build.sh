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