//! Re-exports from `plow-extract::cache`.
//!
//! The cache module has been moved to the `plow-extract` crate since it is
//! tightly coupled with the parsing/extraction pipeline. This module provides
//! backwards-compatible re-exports so that `plow_core::cache::*` paths
//! continue to resolve.

pub use plow_extract::cache::*;
