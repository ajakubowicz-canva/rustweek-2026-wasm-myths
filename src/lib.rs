use wasm_bindgen::prelude::wasm_bindgen;

mod wasm_bridge_string_myths;
mod wasm_bridge_object_myths;
mod wasm_gc_jitter;
mod wasm_simd_speedup;

#[cfg(feature = "threads")]
mod wasm_threading;

// Re-export `init_thread_pool` from `wasm-bindgen-rayon` so the threaded
// artefact's JS bindings expose an `initThreadPool(n)` async function.
// The viewer calls this once after `init()` to spin up the rayon worker
// pool (one Web Worker per thread, all sharing the same Wasm memory).
#[cfg(feature = "threads")]
pub use wasm_bindgen_rayon::init_thread_pool;

/// Very simple `sum function`.
#[wasm_bindgen]
pub fn sum(a: f64, b: f64) -> f64 {
    a + b
}


