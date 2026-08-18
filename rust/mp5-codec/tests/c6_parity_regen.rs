//! Manual regeneration of the c6-parity golden fixtures.
//!
//! The standalone bin (`src/bin/c6_parity.rs`) is sometimes blocked by the
//! Windows App Control policy; the test runner is not. Run with:
//!
//! ```bash
//! cargo test -p mp5-codec --test c6_parity_regen -- --ignored --nocapture
//! ```

#[path = "../src/bin/c6_parity.rs"]
mod gen;

#[test]
#[ignore = "manual fixture regeneration — run explicitly"]
fn regenerate() {
    gen::main();
}
