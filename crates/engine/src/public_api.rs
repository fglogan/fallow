//! Public API graph helpers owned by the engine boundary.

use plow_config::{PackageJson, ResolvedConfig, WorkspaceInfo};
use plow_types::discover::FileId;
use rustc_hash::FxHashSet;

use crate::module_graph::RetainedModuleGraph;

/// Compute the exports-aware public API entry-point set for a project graph.
#[must_use]
pub fn public_api_package_entry_points(
    graph: &RetainedModuleGraph,
    config: &ResolvedConfig,
    root_pkg: Option<&PackageJson>,
    workspaces: &[WorkspaceInfo],
) -> FxHashSet<FileId> {
    plow_core::analyze::public_api_package_entry_points(
        graph.as_graph(),
        config,
        root_pkg,
        workspaces,
    )
}
