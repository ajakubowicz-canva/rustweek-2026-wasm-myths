# Myth: Wasm string overhead ruins performance.

In the [previous myth](myth_ffi_fn_calls.md) we showed that calling a WebAssembly function from
JavaScript is nearly free using an `identity` function. But, by using `JsValue` to pass the string
through Wasm we cannot inspect the contents of the string.

```rust
#[wasm_bindgen]
pub fn identity(val: JsValue) -> JsValue {
    val
}
```

`JsValue` is a lightweight handle to the JavaScript value, thus function execution time is constant
regardless of the string length.

```rust
#[wasm_bindgen]
pub fn string_identity(val: &str) -> String {
    val.to_owned()
}
```

This second Rust function also does no real work, but because it's consuming its argument as a `&str`
and returning it as a `String`, it must copy the JavaScript string into Wasm and decode the Wasm string
back into JavaScript when the value is returned.

<benchmark-graph-viewer
    benches="'bench-wasm-identity','bench-wasm-string-identity'"
    labels="'Wasm identity (JsValue → JsValue)','Wasm string copy identity (&str → String)'"
    N="10000,100000,250000,500000,750000,1000000"
    x-label="String length (chars)"
    rounds="10">
</benchmark-graph-viewer>

Unsurprisingly, the duration of the `JsValue → JsValue` identity remains flat regardless of string size input.
There is nothing to copy, so string length doesn't matter.

The `&str → String` identity scales linearly with string length: every additional character costs
additional encode and decode work.


String copying across the WebAssembly bridge is **not free**, and is instead a memory copy
proportional to the number of bytes. Additionally, JavaScript strings are UTF-16 whilst Rust strings
are UTF-8. The text encoding and decoding process must also make this transcoding.

## A real world example

Because Canva works with designs and colors every day, a common but trivial task is parsing CSS
colors that are strings into their numeric representation.

Thus the problem statement is, given some well-formed CSS hex color such as `#ffdd00`, extract the
red, green, and blue channels. So, for an input of `#ffdd00`, the expected output is `[255, 221, 0]`.

> This case study has also been chosen because it reflects a seemingly worst case scenario for using
> WebAssembly. The input is a small string that must be copied into the WebAssembly linear memory
> (paying a wasm tax), and there is very little processing within WebAssembly to pay-off the tax.

<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

<benchmark-graph-viewer
    benches="'bench-js-hex-color','bench-wasm-hex-color-str'"
    labels="'JavaScript (parseInt)','Wasm &str (TextEncoder + allocation cost)'"
    N="1000,3000,7000,10000"
    x-label="# of colors parsed"
    rounds="25">
</benchmark-graph-viewer>

<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

The JavaScript implementation graphed on the blue line is as follows:

```javascript
function parseHexColor(hex) {
    return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
    ];
}
```

And a sensible Rust implementation graphed on the orange line is implemented as:

```rs
#[wasm_bindgen]
pub fn parse_hex_color_str(hex: &str) -> Vec<u8> {
    let b = hex.as_bytes();
    vec![
        (hex_nibble(b[1]) << 4) | hex_nibble(b[2]),
        (hex_nibble(b[3]) << 4) | hex_nibble(b[4]),
        (hex_nibble(b[5]) << 4) | hex_nibble(b[6]),
    ]
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
```

This benchmark is measuring the total duration for some amount of colors parsed, so it intuitively
makes sense that the Wasm tax scales at a constant factor worse than the JavaScript implementation.
This reinforces the myth that copying strings is expensive, but can we beat JavaScript?

Before optimising this function, what is the WebAssembly implementation doing?

 1. `wasm-bindgen` must allocate a slice of linear memory to copy the JavaScript string to.
 1. `wasm-bindgen` then text encodes the string into that recently allocated linear memory (with a UTF-16 to UTF-8 conversion).
 1. Our function `parse_hex_color_str` is called which allocates a Rust vector.
 1. The vector is copied out into JavaScript.
 1. The Rust vector is freed.

> "If you're willing to restrict the flexibility of your approach, you can almost always do something better" ~ John Carmack

`wasm-bindgen` is extremely ergonomic and general, but, it doesn't know the specifics of our function.
We can do better by leveraging problem specific invariants. We know that:
1. We are running in a single threaded JavaScript environment.
1. The function can pre-allocate 7 bytes and re-use those bytes for the string copy.
1. CSS hex colors consist entirely of ASCII characters, so we do not need to pay for a UTF-16 to
   UTF-8 conversion. ASCII characters are identical in both UTF-16 and UTF-8.
1. The output of three 8 bit unsigned integers can be packed into a single 32 bit number avoiding a
   vector allocation and free.

With this problem specific info, we can write a third Wasm implementation of `parseHexColor` that
has _exactly the same user visible behavior_ as the JavaScript implementation whilst avoiding the
memory allocations.

<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

<benchmark-graph-viewer
    benches="'bench-js-hex-color','bench-wasm-hex-color-str','bench-wasm-hex-color-no-alloc'"
    labels="'JavaScript (parseInt)','Wasm &str (TextEncoder cost)','Wasm (JS facade to reduce allocations)'"
    N="1000,2500,5000,7500,10000,12500,15000"
    x-label="# of colors parsed"
    rounds="20">
</benchmark-graph-viewer>

<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

On my laptop running Chrome, the near-zero allocation variant of the Wasm color parsing function is
almost twice as fast as the JavaScript implementation whilst still paying a string copy wasm tax.

Lets take a look at how this has been done.

```rs
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
```

The Rust code has two large changes that impact the input and output of the
`parse_hex_color_no_alloc` function. First, the input argument is gone. Instead of directly passing
an input and relying on `wasm-bindgen` to implement all of the allocations and copying, we can more
finely control this behavior by preallocating a 7 byte array. JavaScript can then copy the string
into this stable location in linear memory avoiding a memory allocation with the string copy.

Additionally, by packing the returned RGB values into a number, we can avoid the allocation and free
cost of a returned vector.

```js
import { 
    get_hex_buffer_view, 
    parse_hex_color_no_alloc 
} from "../../../generated_wasm/rustweek_2026_wasm_myths.js";

let view = undefined;
function parseHexColor(hex) {
    // Safety: refresh the view if Wasm memory grew so prior memory is detached.
    if (view === undefined || view.byteLength === 0) {
        view = get_hex_buffer_view();
    }
    for (let j = 0; j < 7; j++) {
        view[j] = hex.charCodeAt(j);
    }    
    const colorInt = parse_hex_color_no_alloc();
    return [
        (colorInt >> 16) & 255, // R
        (colorInt >> 8) & 255,  // G
        colorInt & 255          // B
    ];
}
```

This more complex Rust implementation can be paired with a JavaScript facade function that allows
the public `parseHexColor` API to remain unchanged. This function still takes in a hex string and
returns an array of three RGB numbers.

The internals now take a stable view of the linear memory and directly copy the hex string using
`charCodeAt` skipping the `UTF-16` to `UTF-8` conversion. The returned RGB number is also unpacked
into a JavaScript array.

<br/>
<br/>
<hr>
<br/>
<br/>

From doing this exercise I hope I've convinced you that it is possible to **both** pay the Wasm data
copy tax and outperform JavaScript, for a small WebAssembly function while preserving the
user-facing public API.

The high level takeaway here is that `wasm-bindgen` facilitates very high level interactions between
Wasm and JavaScript, but pays a performance penalty for its flexibility. By trading the ergonomic
abstraction for specific and intentional memory management, we can completely avoid the majority of
the Wasm tax and outperform JavaScript even on small functions.
