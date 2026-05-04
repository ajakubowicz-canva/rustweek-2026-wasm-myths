use std::cell::RefCell;

use js_sys::{Uint8Array, WebAssembly};
use wasm_bindgen::{JsCast, JsValue, prelude::wasm_bindgen};

/// An identity function. Value passes through unchanged.
#[wasm_bindgen]
pub fn identity(val: JsValue) -> JsValue {
    val
}

/// A string identity function. Forces wasm-bindgen to decode the JS string into WASM linear memory
/// (UTF-8) and re-encode the returned String back to JS.
#[wasm_bindgen]
pub fn expensive_string_identity(val: &str) -> String {
    val.to_owned()
}

/// Parse a hex color string like "#ffdd00" into [r, g, b] bytes.
#[wasm_bindgen]
pub fn parse_hex_color_str(hex: &str) -> Vec<u8> {
    let b = hex.as_bytes();
    vec![
        (hex_nibble(b[1]) << 4) | hex_nibble(b[2]),
        (hex_nibble(b[3]) << 4) | hex_nibble(b[4]),
        (hex_nibble(b[5]) << 4) | hex_nibble(b[6]),
    ]
}

thread_local! {
    static HEX_STRING_BUF: RefCell<[u8; 7]> = const { RefCell::new([0; 7]) };
}

#[wasm_bindgen]
pub fn get_hex_buffer_view() -> Uint8Array {
    let ptr = HEX_STRING_BUF.with(|buf| buf.as_ptr() as u32);
    let memory: WebAssembly::Memory = wasm_bindgen::memory().unchecked_into();
    Uint8Array::new_with_byte_offset_and_length(&memory.buffer(), ptr, 7)
}

#[wasm_bindgen]
pub fn parse_hex_color_no_alloc() -> u32 {
    HEX_STRING_BUF.with(|buf| {
        let b = buf.borrow();

        let r = ((hex_nibble(b[1]) << 4) | hex_nibble(b[2])) as u32;
        let g = ((hex_nibble(b[3]) << 4) | hex_nibble(b[4])) as u32;
        let b_val = ((hex_nibble(b[5]) << 4) | hex_nibble(b[6])) as u32;

        (r << 16) | (g << 8) | b_val
    })
}

#[inline(always)]
fn hex_nibble(byte: u8) -> u8 {
    match byte {
        b'0'..=b'9' => byte - b'0',
        b'A'..=b'F' => byte - b'A' + 10,
        b'a'..=b'f' => byte - b'a' + 10,
        _ => 0,
    }
}
