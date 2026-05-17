//! SAXPY workload for the Wasm-threading appendix.
//!
//! This module is **only** compiled into the third Wasm artefact
//! (`rustweek_2026_wasm_myths_threads.wasm`) — the one built with
//! `RUSTFLAGS="-C target-feature=+atomics,+bulk-memory"` and `-Z
//! build-std=panic_abort,std` on the nightly toolchain. It's gated by the
//! `threads` Cargo feature, which is also what pulls in `rayon` and
//! `wasm-bindgen-rayon`.
//!
//! The workload itself is deliberately the lightest meaningful parallel
//! map: SAXPY, `out[i] = a * x[i] + y[i]`. Per element it's ~one f32
//! multiply + one f32 add — so cheap that on the JS-workers side, the
//! per-call structured-clone of the three `Float32Array`s (two in, one
//! out) dominates the work itself. That's the whole point: the appendix
//! is about postMessage's I/O cost, not about who has the better
//! arithmetic.
//!
//! On the Wasm-threads side, the three buffers live as `Vec<f32>`s in
//! shared linear memory and rayon's `par_iter_mut` splits the output
//! across the thread pool with zero copying.

use std::cell::RefCell;

use js_sys::{Float32Array, WebAssembly};
use rayon::prelude::*;
use wasm_bindgen::{JsCast, prelude::wasm_bindgen};

// Three `Vec<f32>` buffers held in linear memory, reused across rounds.
// JS resizes them once per `N` (idempotent), then refills `x` and `y`
// every round and reads back from `out`. Holding the buffers stable
// across rounds means we're measuring the loop, not Vec churn — same
// pattern as the SIMD appendix (`src/wasm_simd_speedup.rs`).
thread_local! {
    static SAXPY_X: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
    static SAXPY_Y: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
    static SAXPY_OUT: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
}

/// (Re)size all three SAXPY buffers to `n` elements. No-op if they're
/// already the requested size.
#[wasm_bindgen]
pub fn saxpy_buffers_resize(n: u32) {
    let n = n as usize;
    let resize = |b: &RefCell<Vec<f32>>| {
        let mut b = b.borrow_mut();
        if b.len() != n {
            b.clear();
            b.resize(n, 0.0);
        }
    };
    SAXPY_X.with(resize);
    SAXPY_Y.with(resize);
    SAXPY_OUT.with(resize);
}

/// Returns a `Float32Array` view over buffer X's slice of Wasm linear
/// memory. The view becomes detached if Wasm memory grows, so JS must
/// refresh after `saxpy_buffers_resize` (check `byteLength === 0`).
#[wasm_bindgen]
pub fn saxpy_buffer_x_view() -> Float32Array {
    buffer_view(&SAXPY_X)
}

/// Returns a `Float32Array` view over buffer Y. Same detach caveat as
/// `saxpy_buffer_x_view`.
#[wasm_bindgen]
pub fn saxpy_buffer_y_view() -> Float32Array {
    buffer_view(&SAXPY_Y)
}

/// Returns a `Float32Array` view over the output buffer. Same detach
/// caveat as `saxpy_buffer_x_view`.
#[wasm_bindgen]
pub fn saxpy_buffer_out_view() -> Float32Array {
    buffer_view(&SAXPY_OUT)
}

fn buffer_view(buf: &'static std::thread::LocalKey<RefCell<Vec<f32>>>) -> Float32Array {
    let (ptr, len) = buf.with(|b| {
        let b = b.borrow();
        (b.as_ptr() as u32, b.len() as u32)
    });
    let memory: WebAssembly::Memory = wasm_bindgen::memory().unchecked_into();
    Float32Array::new_with_byte_offset_and_length(&memory.buffer(), ptr, len)
}

// ANCHOR: scalar
/// Plain single-threaded SAXPY. Same arithmetic as the parallel variant
/// below — what changes is whether the loop is split across rayon's
/// thread pool or not.
#[wasm_bindgen]
pub fn saxpy_scalar(n: u32, a: f32) {
    let n = n as usize;
    SAXPY_X.with(|x| {
        SAXPY_Y.with(|y| {
            SAXPY_OUT.with(|o| {
                let x = x.borrow();
                let y = y.borrow();
                let mut o = o.borrow_mut();
                let x = &x[..n];
                let y = &y[..n];
                let o = &mut o[..n];
                for i in 0..n {
                    o[i] = a * x[i] + y[i];
                }
            })
        })
    });
}
// ANCHOR_END: scalar

// ANCHOR: parallel
/// Parallel SAXPY via rayon. The three slices live in shared Wasm
/// linear memory; `par_iter_mut` splits the output across the thread
/// pool and each worker thread writes into its own non-overlapping
/// chunk — no `Mutex` needed because the lanes are disjoint.
///
/// Compared to the JS-workers variant (which postMessages two input
/// chunks in and one output chunk back per call, paying structured-clone
/// cost on every byte), this whole function moves zero bytes across any
/// boundary: every read and every write is into memory the whole pool
/// already shares.
#[wasm_bindgen]
pub fn saxpy_parallel(n: u32, a: f32) {
    let n = n as usize;
    SAXPY_X.with(|x| {
        SAXPY_Y.with(|y| {
            SAXPY_OUT.with(|o| {
                let x = x.borrow();
                let y = y.borrow();
                let mut o = o.borrow_mut();
                let x = &x[..n];
                let y = &y[..n];
                let o = &mut o[..n];
                // `with_min_len` keeps rayon from splitting the work
                // into lanes so small that task-spawn overhead swamps a
                // few hundred FMAs at the smallest sweep point.
                o.par_iter_mut()
                    .with_min_len(8192)
                    .zip(x.par_iter())
                    .zip(y.par_iter())
                    .for_each(|((out, &xv), &yv)| {
                        *out = a * xv + yv;
                    });
            })
        })
    });
}
// ANCHOR_END: parallel
