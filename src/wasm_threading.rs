use std::cell::RefCell;

use js_sys::{Float32Array, WebAssembly};
use rayon::prelude::*;
use wasm_bindgen::{JsCast, prelude::wasm_bindgen};

thread_local! {
    static SAXPY_X: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
    static SAXPY_Y: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
    static SAXPY_OUT: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
}

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

#[wasm_bindgen]
pub fn saxpy_buffer_x_view() -> Float32Array {
    buffer_view(&SAXPY_X)
}

#[wasm_bindgen]
pub fn saxpy_buffer_y_view() -> Float32Array {
    buffer_view(&SAXPY_Y)
}

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
