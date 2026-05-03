#!/bin/bash

cargo build --release --target wasm32-unknown-unknown
wasm-bindgen --out-dir ./javascript/generated_wasm ./target/wasm32-unknown-unknown/release/rustweek_2026_wasm_myths.wasm --target web