# Why WebAssembly on the browser?

> "Is WebAssembly magic performance pixie dust? .... The incredibly unsatisfying answer is: It
> depends." ~ [Surma](https://surma.dev/things/js-to-asc/)

Although JavaScript can be written to be extremely fast, it's non trivial to squeeze performance out
of it. Often it requires writing the JavaScript like C code, and you still need to be extremely
aware of performance cliffs that exist in the underlying JavaScript interpreters.

This book comes with a built-in benchmark runner so we can test directly in your browser. Because it
runs on your specific hardware and browser engine, your results will be unique. If the data looks
noisy, hit the `↺ Restart` button.

To test out the benchmark system in pure JavaScript, let's explicitly measure the performance degradation
of function deoptimisation.

Although JavaScript is dynamically typed, object literals are still assigned a hidden class. So,
declaring `{a: 1, b: 2}` in JavaScript gets a different hidden class from the object `{b: 2, a: 1}`
even though the objects are otherwise identical. If a function is called with different hidden class
arguments, it can deoptimise and become much slower to call.



Given this trivial function that sums some fields on a JavaScript object:

```javascript
function sum_fields(obj) {
    return obj.a + obj.b + obj.c + obj.d + obj.e;
}
```
We can benchmark and compare the speed of the function based on simply what input objects are generated
for the benchmark.

The **monomorphic** benchmark creates input data using a single factory — one shape, one hidden class, function is expected on the fast path:

```typescript
{{#include ../../javascript/src/benchmarks/mono_mega/monomorphic.ts:factory}}
```

The **megamorphic** benchmark generates input data by randomly choosing from one of eight factories.
Each factory generates the object literal with fields in different orders causing the function to
deoptimise.

```typescript
{{#include ../../javascript/src/benchmarks/mono_mega/megamorphic.ts:factories}}
```


The graph below is calculated on your machine so may show slightly different results on each try.

<benchmark-graph-viewer                
    benches="'bench-monomorphic','bench-megamorphic'"
    labels="'Monomorphic input','Megamorphic input'"
    N="10,100,1000,10000,30000,50000,80000,100000"
    x-label="# of objects generated"
    >
</benchmark-graph-viewer> 

The graph above shows that the inputs into otherwise identical functions can have huge impact on the
performance of the function. In the worst case the megamorphic benchmark can be 10 times slower. In
fact, these optimisations were specifically used to improve [TypeScript's compiler
performance](https://github.com/microsoft/TypeScript/pull/51880).


Unlike JavaScript, which contains these complex runtime behaviors and heuristics, WebAssembly is
statically typed and compiled ahead of time. This allows WebAssembly to achieve its design goal of
deterministic high performance.
