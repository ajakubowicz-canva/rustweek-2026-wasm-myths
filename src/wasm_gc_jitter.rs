use std::cell::RefCell;
use std::collections::VecDeque;

use wasm_bindgen::prelude::wasm_bindgen;

// ANCHOR: wasm_alloc
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
// ANCHOR_END: wasm_alloc

thread_local! {
    static RETAIN: RefCell<VecDeque<TreeNode>> = RefCell::new(VecDeque::new());
}

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

#[wasm_bindgen]
pub fn alloc_op_reset() {
    RETAIN.with(|r| r.borrow_mut().clear());
}
