use std::cell::RefCell;

use js_sys::{Float32Array, WebAssembly};
use wasm_bindgen::{JsCast, prelude::wasm_bindgen};

// Two `Vec<f32>` buffers held in linear memory, reused across rounds. The
// benchmark caller resizes them once per `N` (idempotent) and then refills
// them every round. Holding the buffers stable across rounds means our
// chart isn't measuring `Vec` (de)allocation cost — only the dot product.
thread_local! {
    static DOT_A: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
    static DOT_B: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
}

/// (Re)size the two dot-product buffers to `n` elements. No-op if the
/// buffers are already at the requested size.
#[wasm_bindgen]
pub fn dot_buffers_resize(n: u32) {
    let n = n as usize;
    DOT_A.with(|a| {
        let mut a = a.borrow_mut();
        if a.len() != n {
            a.clear();
            a.resize(n, 0.0);
        }
    });
    DOT_B.with(|b| {
        let mut b = b.borrow_mut();
        if b.len() != n {
            b.clear();
            b.resize(n, 0.0);
        }
    });
}

/// Returns a `Float32Array` view over buffer A's slice of Wasm linear
/// memory. The returned view becomes detached if Wasm memory grows, so JS
/// must refresh the view (check `byteLength === 0`) after any operation
/// that may have triggered growth — e.g. `dot_buffers_resize`.
#[wasm_bindgen]
pub fn dot_buffer_a_view() -> Float32Array {
    buffer_view(&DOT_A)
}

/// Returns a `Float32Array` view over buffer B's slice of Wasm linear
/// memory. Same detach caveat as `dot_buffer_a_view`.
#[wasm_bindgen]
pub fn dot_buffer_b_view() -> Float32Array {
    buffer_view(&DOT_B)
}

fn buffer_view(buf: &'static std::thread::LocalKey<RefCell<Vec<f32>>>) -> Float32Array {
    let (ptr, len) = buf.with(|b| {
        let b = b.borrow();
        (b.as_ptr() as u32, b.len() as u32)
    });
    let memory: WebAssembly::Memory = wasm_bindgen::memory().unchecked_into();
    // `Float32Array::new_with_byte_offset_and_length` takes a byte offset
    // and an *element* count.
    Float32Array::new_with_byte_offset_and_length(&memory.buffer(), ptr, len)
}

// ANCHOR: scalar
/// Plain scalar dot product. Compiled into the non-SIMD artefact this is
/// genuinely scalar code: there is no `+simd128` target feature, so LLVM
/// has no SIMD lanes to vectorise into. The float-add reduction also
/// blocks any auto-vectorisation, since IEEE-754 addition isn't
/// associative.
#[wasm_bindgen]
pub fn dot_product_scalar(n: u32) -> f32 {
    let n = n as usize;
    DOT_A.with(|a| {
        DOT_B.with(|b| {
            let a = a.borrow();
            let b = b.borrow();
            let a = &a[..n];
            let b = &b[..n];
            let mut acc = 0.0_f32;
            for i in 0..n {
                acc += a[i] * b[i];
            }
            acc
        })
    })
}
// ANCHOR_END: scalar

// ANCHOR: simd
/// Explicit-SIMD dot product. Only compiled into the `+simd128` artefact;
/// in the scalar build this function does not exist and the JS binding
/// for it is therefore only present in `rustweek_2026_wasm_myths_simd.js`.
///
/// The shape is the canonical four-lane f32 dot product: load 16 bytes
/// at a time as a `v128`, multiply lane-wise, accumulate into a `v128`
/// running sum, then horizontally reduce the four lanes once at the end.
/// A scalar tail handles whatever doesn't divide by 4.
#[cfg(target_feature = "simd128")]
#[wasm_bindgen]
pub fn dot_product_simd(n: u32) -> f32 {
    use std::arch::wasm32::{
        f32x4_add, f32x4_extract_lane, f32x4_mul, f32x4_splat, v128_load,
    };

    let n = n as usize;
    DOT_A.with(|a| {
        DOT_B.with(|b| {
            let a = a.borrow();
            let b = b.borrow();
            let a = &a[..n];
            let b = &b[..n];

            let mut acc = f32x4_splat(0.0);
            let chunks = n / 4;
            // SAFETY: `a` and `b` are `&[f32]` of length `n`; we read
            // exactly `chunks * 4` lanes and the scalar tail covers the
            // remainder. `v128_load` requires only natural f32 alignment,
            // which `Vec<f32>` provides.
            unsafe {
                for i in 0..chunks {
                    let va = v128_load(a.as_ptr().add(i * 4) as *const _);
                    let vb = v128_load(b.as_ptr().add(i * 4) as *const _);
                    acc = f32x4_add(acc, f32x4_mul(va, vb));
                }
            }

            let mut sum = f32x4_extract_lane::<0>(acc)
                + f32x4_extract_lane::<1>(acc)
                + f32x4_extract_lane::<2>(acc)
                + f32x4_extract_lane::<3>(acc);
            for i in (chunks * 4)..n {
                sum += a[i] * b[i];
            }
            sum
        })
    })
}
// ANCHOR_END: simd
