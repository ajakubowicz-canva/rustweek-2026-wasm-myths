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
    id: 'aaaaaaaaaaaa[... 10,000 length string truncated]',
    a: 6,
    b: 7
}) // returns 13
```

