use wasm_bindgen::prelude::wasm_bindgen;

mod wasm_bridge_string_myths;
mod wasm_bridge_object_myths;
mod wasm_gc_jitter;

/// Very simple `sum function`.
#[wasm_bindgen]
pub fn sum(a: f64, b: f64) -> f64 {
    a + b
}


