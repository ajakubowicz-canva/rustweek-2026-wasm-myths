use wasm_bindgen::{JsCast, JsValue, prelude::wasm_bindgen};

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

/// Parse a hex color string like "#ffdd00" into [r, g, b] bytes.
#[wasm_bindgen]
pub fn parse_hex_color_jsvalue(val: JsValue) -> Vec<u8> {
    let s = val.unchecked_into::<js_sys::JsString>();
    vec![
        (hex_digit(s.char_code_at(1) as u32) << 4) | hex_digit(s.char_code_at(2) as u32),
        (hex_digit(s.char_code_at(3) as u32) << 4) | hex_digit(s.char_code_at(4) as u32),
        (hex_digit(s.char_code_at(5) as u32) << 4) | hex_digit(s.char_code_at(6) as u32),
    ]
}

fn hex_nibble(byte: u8) -> u8 {
    match byte {
        b'0'..=b'9' => byte - b'0',
        b'A'..=b'F' => byte - b'A' + 10,
        b'a'..=b'f' => byte - b'a' + 10,
        _ => 0,
    }
}

fn hex_digit(code: u32) -> u8 {
    match code {
        48..=57 => (code - 48) as u8,
        65..=70 => (code - 55) as u8,
        97..=102 => (code - 87) as u8,
        _ => 0,
    }
}
