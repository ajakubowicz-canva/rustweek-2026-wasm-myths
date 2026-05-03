# Rustweek 2026 Companion Book – Debunking Rust Wasm Performance Myths: Why We Moved Core Business Logic to Rust at Canva

By Andrew Jakubowicz & Taj Pereira

## Requirements

> Developed with Rust 1.94.0

 - [`cargo-binstall` CLI](https://crates.io/crates/cargo-binstall)

Then install the following dependencies to build the markdown book:

 - `cargo binstall mdbook@0.5.2 --only-signed` – tool for building book.
 - `cargo binstall wasm-bindgen-cli@0.2.120 --only-signed` – tool for generating wrapped wasm
   JavaScript Module.

For JavaScript, install `pnpm` and then run `pnpm install` from the `javascript` directory.

## Development

Install:

 - `cargo binstall bacon@3.22.0 --only-signed` – watch and re-compile wasm code.


In one terminal run `bacon dev` – build Wasm and JavaScript.
In the other terminal run `mdbook serve` – builds and serves book.
