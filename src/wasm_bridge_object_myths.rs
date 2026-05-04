use serde::Deserialize;
use wasm_bindgen::{JsValue, prelude::wasm_bindgen};

#[derive(Deserialize)]
struct SumABData {
    a: f64,
    b: f64,
}

#[wasm_bindgen]
pub fn sum_ab_serde(val: JsValue) -> f64 {
    let obj: SumABData = serde_wasm_bindgen::from_value(val).unwrap();
    obj.a + obj.b
}

#[wasm_bindgen]
extern "C" {
    pub type SumABObj;
    #[wasm_bindgen(method, getter)]
    pub fn a(this: &SumABObj) -> f64;
    #[wasm_bindgen(method, getter)]
    pub fn b(this: &SumABObj) -> f64;
}

#[wasm_bindgen]
pub fn sum_ab_structural(obj: &SumABObj) -> f64 {
    obj.a() + obj.b()
}
