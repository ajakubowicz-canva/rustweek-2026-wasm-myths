use wasm_bindgen::{JsValue, prelude::wasm_bindgen};


/// An identity function. Value passes through unchanged.
#[wasm_bindgen]
pub fn identity(val: JsValue) -> JsValue {
    val
}