use std::cell::RefCell;

use js_sys::{Float32Array, WebAssembly};
use wasm_bindgen::{JsCast, prelude::wasm_bindgen};

thread_local! {
    static DOT_A: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
    static DOT_B: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
}

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

#[wasm_bindgen]
pub fn dot_buffer_a_view() -> Float32Array {
    buffer_view(&DOT_A)
}

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
    Float32Array::new_with_byte_offset_and_length(&memory.buffer(), ptr, len)
}

// ANCHOR: scalar
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
            // remainder.
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
