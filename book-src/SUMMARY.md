# Summary

- [Why WebAssembly on the browser?](./pages/why_wasm.md)

- [Wasm Bridge Myths](./pages/wasm_bridge_myths/intro.md)
    - [Myth: Calls crossing the Wasm Bridge are expensive](./pages/wasm_bridge_myths/myth_ffi_fn_calls.md)
    - [Myth: Wasm string overhead ruins performance.](./pages/wasm_bridge_myths/myth_strings.md)
    - [Myth: Working with objects in WebAssembly is expensive](./pages/wasm_bridge_myths/myth_objects.md)

- [Wasm Performance](./pages/wasm_performance/intro.md)
    - [GC jitter: how JS GC breaks predictable performance](./pages/wasm_performance/wasm_gc_jitter.md)
    - [Wasm SIMD: a primitive JavaScript doesn't have](./pages/wasm_performance/wasm_simd_speedup.md)
    - [Wasm threading: parallel without paying postMessage](./pages/wasm_performance/wasm_threading.md)
