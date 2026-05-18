export function fillRandomFloat32(view: Float32Array, seed: number): void {
    // Cheap RNG.
    let s = (seed | 0) || 1;
    for (let i = 0; i < view.length; i++) {
        s = (s * 1664525 + 1013904223) | 0;
        view[i] = ((s >>> 8) & 0xffff) / 0xffff - 0.5;
    }
}
