# Why WebAssembly on the browser?

> "Is WebAssembly magic performance pixie dust? .... The incredibly unsatisfying answer is: It
> depends." ~ [Surma](https://surma.dev/things/js-to-asc/)

Although JavaScript can be written to be extremely fast, it's non trivial to squeeze performance out
of it. Often it requires writing the JavaScript like C code, and you need to be extremely aware of
performance cliffs that are built into the underlying JavaScript interpreters.

For example, functions can deoptimise based on the object shapes passed into them:

<benchmark-graph-viewer></benchmark-graph-viewer>
