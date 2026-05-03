# WebAssembly to JavaScript Bridge Myths

WebAssembly is designed to interoperate with the existing web ecosystem, but also embed in external
systems outside the browser. Thus, WebAssembly does not natively operate directly on JavaScript data
structures but instead operates on numbers passed into Wasm functions, or on its shared linear
memory.

This means that JavaScript data that needs to be inspected by WebAssembly must be first copied into
the linear memory. This fundamental truth has created some myths:

1. Calling from Wasm to Js and vice-versa is expensive.
1. Strings are expensive to pass across the Wasm bridge.
1. Large complex objects are tricky to work with across the Wasm bridge.

The truth is the copy cost is unavoidable. How expensive is it, and can it be avoided or mitigated?
