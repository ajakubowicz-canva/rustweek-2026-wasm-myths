use wasm_bindgen::{JsValue, prelude::wasm_bindgen};

/// An identity function. Value passes through unchanged.
#[wasm_bindgen]
pub fn identity(val: JsValue) -> JsValue {
    val
}

/// A string identity function. Forces wasm-bindgen to decode the JS string into
/// WASM linear memory (UTF-8) and re-encode the returned String back to JS.
#[wasm_bindgen]
pub fn expensive_string_identity(val: &str) -> String {
    val.to_owned()
}
