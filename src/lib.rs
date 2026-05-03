use wasm_bindgen::prelude::wasm_bindgen;



/// Very simple `sum function`.
#[wasm_bindgen]
pub fn sum(a: f64, b: f64) -> f64 {
    a + b
}
