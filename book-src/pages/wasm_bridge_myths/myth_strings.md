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
regardless the string length.

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
proportional to the number of bytes. Additionally, JavaScript strings are UTF–16 whilst Rust strings
are UTF–8. The text encoding and decoding process must also make this transcoding.

## Algorithmic Complexity of string copy tax

Thinking in terms of algorithmic complexity, if a JavaScript algorithm is linear over a string, the
equivalent Wasm function is also linear — plus the linear cost of copying the string across the
bridge. \\(O(n) + O(n)\\) is still \\(O(n)\\). **The complexity class is unchanged.**

The copy raises the constant factor, not the scaling behaviour. Two strategies follow from this. If
your algorithm only reads a *subset* of the string, copying the whole thing is wasteful. And if the
same string is needed across multiple Wasm calls, copying it once and keeping it in Wasm memory
amortises that cost to a one-time setup rather than a per-call overhead.

## Measuring something real world

TODO
