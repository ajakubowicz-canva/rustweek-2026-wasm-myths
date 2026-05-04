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