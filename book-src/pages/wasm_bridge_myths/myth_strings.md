# Myth: Copying strings across the Wasm bridge is expensive

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

This function does no real work — it just copies the input and returns it — but it forces both a
decode and an encode across the bridge on every call.

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

## Algorithmic Complexity of string copy tax

Thinking in terms of algorithmic complexity, if a JavaScript algorithm is linear over a string, the
equivalent Wasm function is also linear — plus the linear cost of copying the string across the
bridge. \\(O(n) + O(n)\\) is still \\(O(n)\\). **The complexity class is unchanged.**

The copy raises the constant factor, not the scaling behaviour. Two strategies follow from this. If
your algorithm only reads a *subset* of the string, copying the whole thing is wasteful. And if the
same string is needed across multiple Wasm calls, copying it once and keeping it in Wasm memory
amortises that cost to a one-time setup rather than a per-call overhead.

But, in practice, it's more complicated than this and we can only lean on algorithmic complexity as
a worst case measurement.

## Measuring something real world

Because Canva works with designs and colors every day, a common but trivial task is parsing CSS
colors that are strings into numbers that can be worked with.

Thus the problem statement is, given some well-formed CSS hex color such as `#ffdd00`, extract the
red, green, and blue channels. Thus for an input of `#ffdd00`, the expected output is `[255, 221, 0]`.


<benchmark-graph-viewer
    benches="'bench-js-hex-color','bench-wasm-hex-color-str'"
    labels="'JavaScript (parseInt)','Wasm &str (TextEncoder + allocation cost)'"
    N="1000,3000,7000,10000"
    x-label="# of colors parsed"
    rounds="25">
</benchmark-graph-viewer>

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
makes sense that the wasm + string copy tax scales at a constant factor worse than the JavaScript
implementation. This reinforces the myth that copying strings is expensive, but can we do better?

What is the WebAssembly implementation doing?

 1. `wasm-bindgen` must allocate a slice of linear memory to copy the JavaScript string to.
 1. `wasm-bindgen` then text encodes the string into that recently allocated linear memory (with a UTF-16 to UTF-8 conversion).
 1. Our function `parse_hex_color_str` is called which allocates a Rust vector.
 1. The vector is copied out into JavaScript.
 1. The Rust vector is freed.

We can do better with a function that encodes more semantic information of our use-case. What do we know:
1. We are running in a single threaded JavaScript environment.
1. The function can allocate 7 bytes and re-use those bytes for the string colors that always have a length of 7.
1. CSS hex colors consist entirely of ASCII characters, so we do not need to pay for a UTF-16 to
   UTF-8 conversion. ASCII characters are identical between UTF-16 and UTF-8.
1. The output of three 8 bit unsigned integers can be packed into a single 32 bit number avoiding a
   vector allocation.

With this domain information we can write a JavaScript facade wrapping our WebAssembly function that provides the
same exact behavior but with far more favorable memory conditions.

<benchmark-graph-viewer
    benches="'bench-js-hex-color','bench-wasm-hex-color-str','bench-wasm-hex-color-no-alloc'"
    labels="'JavaScript (parseInt)','Wasm &str (TextEncoder cost)','Wasm (JS facade to reduce allocations)'"
    N="1000,2500,5000,7500,10000,12500,15000"
    x-label="# of colors parsed"
    rounds="20">
</benchmark-graph-viewer>

Now we are approximately 40% faster than the JavaScript implementation.

Let's take a look at the new much faster code.

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

The Rust code has two large changes that impact the input and output of the `parse_hex_color_no_alloc`
function. First, the input is gone. Instead of passing the input and relying on `wasm-bindgen` to
implement all of the allocations and copying, we can more finely control this behavior by
preallocating a 7 byte array. JavaScript can then copy the string into this stable location in linear memory
and that avoids a memory allocation with the string copy.

Additionally, by packing the returned RGB values into a number, we can avoid the allocation and free
cost of a vector.

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

This JavaScript facade function ensures the more complicated logic has a nice public API. This
function still takes in a hex string and returns a three value array of RGB numbers. The internals
now take a stable view of the linear memory and directly copy the hex string using `charCodeAt`
which skips the `UTF-16` to `UTF-8` conversion. The returned RGB number is also unpacked into a
JavaScript array.

At this point we're truly paying exclusively the wasm tax of copying a string into the WebAssembly
linear memory, and we can outperform JavaScript significantly. This is a lot of work to beat
JavaScript, however, our Rust function is barely doing any computation – the actual point of opting
into WebAssembly.

The takeaway is that there is a wasm tax to copy data into WebAssembly, but just copying bytes onto
a linear array is not that expensive. The expense builds up from copying paired with many
allocations and deallocations.

