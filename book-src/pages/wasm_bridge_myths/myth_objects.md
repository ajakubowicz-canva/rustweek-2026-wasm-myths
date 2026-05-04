# Myth: Working with objects in WebAssembly is expensive


This myth is a natural extension of the myth that [strings are expensive](./myth_strings.md).
Objects must also navigate the wasm tax of having their data be copied into WebAssembly linear
memory. The additional complexity is that there are extra crates available such as
`serde_wasm_bindgen` that can further assist with copying JavaScript objects into Rust, and
vice-versa.

The mental model for achieving performance remains exactly the same as strings. Performance is achieved by reducing the amount of data copied, and the amount of memory allocations. For
the object myth I think it's instructive to jump straight into a benchmarked case study.

## Case Study

The JavaScript function we will be benchmarking against is the following:

```javascript
function sum_object_a_b(obj) {
    return obj.a + obj.b
}

// Usage example:
sum_object_a_b({a: 6, b: 7}) // returns 13
```

However, JavaScript is a dynamically typed language. Although the `sum_object_a_b` function expects
the fields `a` and `b`, additional fields may also be present and are ignored. The objects generated
for benchmarking contain an additional `id` field containing a 10,000 length random string.

Thus an example input ends up looking like:

```javascript
sum_object_a_b({
    id: 'aaaaaaaaaaaa[... 1,000 length string truncated]',
    a: 6,
    b: 7
}) // returns 13
```

Instead of benchmarking the variants up top and then explaining them, below are three different
WebAssembly implementations. As I introduce each one try and guess how it compares to the JavaScript
implementation given the input data.

### A: Pass object argument with `serde_wasm_bindgen` crate

```rust
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
```

The `serde_wasm_bindgen` crate provides an incredibly ergonomic, "Rust-native" developer experience.
You define a strongly typed struct, and the library handles the translation.

This abstraction comes with a cost as the WebAssembly module must dynamically inspect the JavaScript
object across the Wasm and JavaScript boundary, handle type checking, and allocate a new Rust
struct.

### B: Use `wasm_bindgen` structural access to object fields

```rust
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
```

Using `wasm-bindgen` directly, we can annotate an `extern "C"` type directly with the getters we
expect to be present. This allows `SumABObj` to have fields `a` and `b` directly accessed.
`wasm-bindgen` generates these getters for us whilst also avoiding copying the object and allocating
a new struct.


### C: Use a JavaScript facade to destructure the object and pass through the fields directly

```javascript
import { sum } from "../../../generated_wasm/rustweek_2026_wasm_myths.js";

function sum_object_facade(obj: BenchObj): number {
    return sum(obj.a, obj.b)
}
```

Where `sum` is defined as:

```rust
#[wasm_bindgen]
pub fn sum(a: f64, b: f64) -> f64 {
    a + b
}
```

This approach applies a similar optimisation strategy as used in the CSS hex color example. Rely on
the host environment for its heavily optimised property access, and then directly pass the `a` and
`b` values directly into the wasm function we avoid all objects.

This option ends up very performant but it's not always viable for deeply nested or highly complex
objects.


<benchmark-graph-viewer
    benches="'bench-js-objects','bench-wasm-objects-serde','bench-wasm-objects-extern-getters','bench-wasm-objects-js-facade'"
    labels="'JavaScript control','A: Wasm serde (object deserialization)','B: Wasm extern getters','C: JS facade'"
    N="2500,5000,7500,10000,15000,20000"
    x-label="# of objects"
    rounds="30">
</benchmark-graph-viewer>

So, are objects expensive to work with in WebAssembly? It entirely depends on how you handle them.

If you attempt to generically deserialize objects using `serde_wasm_bindgen` on a hot path, the
overhead will definitely ruin your performance. The tax is too high. On my machine
`serde_wasm_bindgen` runs about six times slower than `B: structural access`. 

Option `B` initially made me concerned about the multiple function calls and performance degradation
caused when calling the wasm_bindgen generated getters. I actually went to an open source Rust
library where I know there is a lot of web_sys and I essentially pulled JavaScript out of the Rust
similar to `C` the facade pattern. But – this ends up being a micro optimisation so small that I
couldn't achieve any measurable difference.

Thus I think `B` is acceptable for the vast majority of application code where developer ergonomics and
maintainability are the primary goals.


## Conclusion

It's critical to keep in mind exactly what these benchmarks are measuring. **Pure wasm tax overhead**.

In the objects case study, the Wasm functions do almost zero actual work. We're only adding two
numbers together. This means measurements are heavily skewed to show only the fee of crossing the
JavaScript to WebAssembly bridge, without reaping any of the WebAssembly rewards.

As shown by the CSS string color parsing examples, it doesn't take much computation for WebAssembly
to pay off the wasm tax. The wasm tax is real, but, provided you consider your data access patterns,
it is a small entry fee to a much faster, and much more predictable execution environment.
