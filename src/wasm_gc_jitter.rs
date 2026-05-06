use std::cell::RefCell;
use std::collections::VecDeque;

use wasm_bindgen::prelude::wasm_bindgen;

// ANCHOR: wasm_alloc
/// A node in a balanced N-ary tree. Each node carries a small numeric
/// payload and an owned `Vec` of child nodes. The structure is
/// intentionally pointer-heavy: every non-leaf node owns a separately
/// heap-allocated `Vec`, and the JavaScript counterpart carries the
/// matching shape using plain objects + arrays. Building one tree
/// produces a graph of tens of thousands of cross-referencing live
/// objects — exactly the workload that punishes a tracing collector
/// during the mark phase.
struct TreeNode {
    value: u32,
    children: Vec<TreeNode>,
}

fn build_tree(depth: u32, branching: u32, seed: u32) -> TreeNode {
    let mut children: Vec<TreeNode> = Vec::new();
    if depth > 0 {
        children.reserve_exact(branching as usize);
        for i in 0..branching {
            let child_seed = seed.wrapping_mul(31).wrapping_add(i);
            children.push(build_tree(depth - 1, branching, child_seed));
        }
    }
    TreeNode { value: seed, children }
}

fn sum_tree(node: &TreeNode) -> u32 {
    let mut sum = node.value;
    for child in &node.children {
        sum = sum.wrapping_add(sum_tree(child));
    }
    sum
}

// Rolling retention buffer for `alloc_op`. Keeping recent trees alive
// across calls is what forces objects to be promoted to V8's old
// generation, which is what triggers major GC pauses (the painful kind).
// On the Wasm side the same pattern grows linear memory and the allocator
// recycles it deterministically when `pop_front` drops a tree — no
// stop-the-world, no graph traversal during reclamation.
thread_local! {
    static RETAIN: RefCell<VecDeque<TreeNode>> = RefCell::new(VecDeque::new());
}

/// Tree-allocation workload for the GC-jitter benchmark.
///
/// Per call: builds a balanced N-ary tree of `branching ^ depth` leaves
/// (plus all the interior nodes), recursively sums every node's value,
/// then either drops the tree or pushes it onto a rolling retention
/// buffer of length `retain_frames`. The retention is what makes V8 pay
/// full mark-compact cost for every retained node on every major GC.
/// Rust drops the tree by walking it once and returning the memory to
/// the allocator — no GC, no tracing.
#[wasm_bindgen]
pub fn alloc_op(depth: u32, branching: u32, retain_frames: u32, seed: u32) -> u32 {
    let tree = build_tree(depth, branching, seed);
    let sum = sum_tree(&tree);
    if retain_frames > 0 {
        RETAIN.with(|r| {
            let mut r = r.borrow_mut();
            r.push_back(tree);
            while r.len() > retain_frames as usize {
                r.pop_front();
            }
        });
    }
    sum
}

/// Drop everything held by the retention buffer. Useful from JS between
/// runs to release wasm linear memory back to the allocator.
#[wasm_bindgen]
pub fn alloc_op_reset() {
    RETAIN.with(|r| r.borrow_mut().clear());
}
// ANCHOR_END: wasm_alloc
