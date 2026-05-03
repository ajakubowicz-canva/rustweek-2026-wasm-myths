# Myth: Calling from JavaScript to WebAssembly and vice-versa is expensive

Every call to a WebAssembly function crosses the FFI boundary, does that add up as measurable overhead?

We can compare an `identity` function implemented in JavaScript directly against a Rust `identity`
function.

The **JavaScript identity** never leaves JavaScript:

```typescript
function identity(val: unknown): unknown {
    return val;
}
```

The **WebAssembly identity** crosses the bridge on every call:

```rust
#[wasm_bindgen]
pub fn identity(val: JsValue) -> JsValue {
    val
}
```

Both benchmarks receive a pre-generated string of length \\(N\\) and call their respective identity function once. Generation is unmeasured.


<benchmark-graph-viewer
    benches="'bench-js-identity','bench-wasm-identity'"
    labels="'JS identity','Wasm identity'"
    N="10000,100000,250000,500000,750000,1000000"
    x-label="String length (chars)"
    rounds="10000">
</benchmark-graph-viewer>

Results for this benchmark are extremely noisy because in both cases the computation is almost
instant regardless of the length of the generated string being passed in.

> Did you notice that we are passing a generated string through WebAssembly using a `JsValue` type?
> This type allows `wasm-bindgen` to pass a lightweight reference to the JavaScript string and
> entirely skip copying the JavaScript string into WebAssembly's linear memory.

However, we don't need many benchmarks to prove that WebAssembly functions are extremely optimised.
All the way back in 2018, one year before WebAssembly was made the fourth language of the Web, [calls
between JavaScript and WebAssembly became fast](https://hacks.mozilla.org/2018/10/calls-between-javascript-and-webassembly-are-finally-fast-%F0%9F%8E%89/).

In the more recent times JavaScript engines are continuously adding optimisations to WebAssembly,
for example V8, the JavaScript engine running in Chrome can speculatively inline all WebAssembly
function call instructions, e.g. `call`, `call_indirect`, and `call_ref`.

Thus we can safely say, myth busted!
