use crate::health_types::{CoverageGapSummary, CoverageGaps, UntestedExport, UntestedFile};

pub(super) struct CoverageGapData {
    pub report: CoverageGaps,
    pub runtime_paths: Vec<std::path::PathBuf>,
}

pub(super) fn build_coverage_summary(
    runtime_files: usize,
    covered_files: usize,
    untested_files: usize,
    untested_exports: usize,
) -> CoverageGapSummary {
    let file_coverage_pct = if runtime_files == 0 {
        100.0
    } else {
        ((covered_files as f64 / runtime_files as f64) * 1000.0).round() / 10.0
    };

    CoverageGapSummary {
        runtime_files,
        covered_files,
        file_coverage_pct,
        untested_files,
        untested_exports,
    }
}

pub(super) fn compute_coverage_gaps(
    graph: &plow_core::graph::ModuleGraph,
    file_paths: &rustc_hash::FxHashMap<plow_core::discover::FileId, &std::path::PathBuf>,
    module_by_id: &rustc_hash::FxHashMap<
        plow_core::discover::FileId,
        &plow_core::extract::ModuleInfo,
    >,
    unused_exports: &rustc_hash::FxHashSet<(&std::path::Path, String)>,
    root: &std::path::Path,
) -> CoverageGapData {
    let mut runtime_files = 0usize;
    let mut covered_files = 0usize;
    let mut runtime_paths = Vec::new();
    let mut files: Vec<UntestedFile> = Vec::new();
    let mut exports: Vec<UntestedExport> = Vec::new();

    for node in &graph.modules {
        if !node.is_runtime_reachable() {
            continue;
        }

        let Some(path) = file_paths.get(&node.file_id) else {
            continue;
        };

        if path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|ext| matches!(ext, "css" | "scss" | "less" | "sass"))
        {
            continue;
        }

        let module = module_by_id.get(&node.file_id);
        if module.is_some_and(|m| {
            plow_core::suppress::is_file_suppressed(
                &m.suppressions,
                plow_types::suppress::IssueKind::CoverageGaps,
            )
        }) {
            continue;
        }

        runtime_paths.push((*path).clone());

        runtime_files += 1;
        if node.is_test_reachable() {
            covered_files += 1;
        } else {
            files.push(UntestedFile {
                path: (*path).clone(),
                value_export_count: node.exports.iter().filter(|e| !e.is_type_only).count(),
            });
        }

        let Some(module) = module else {
            continue;
        };

        for export in &node.exports {
            if export.is_type_only {
                continue;
            }
            if unused_exports.contains(&(path.as_path(), export.name.to_string())) {
                continue;
            }

            let has_test_dependency = export.references.iter().any(|reference| {
                graph
                    .modules
                    .get(reference.from_file.0 as usize)
                    .is_some_and(|module| module.is_test_reachable())
            });
            if has_test_dependency {
                continue;
            }

            let (line, col) = plow_types::extract::byte_offset_to_line_col(
                &module.line_offsets,
                export.span.start,
            );
            exports.push(UntestedExport {
                path: (*path).clone(),
                export_name: export.name.to_string(),
                line,
                col,
            });
        }
    }

    files.sort_by(|a, b| a.path.cmp(&b.path));
    exports.sort_by(|a, b| {
        a.path
            .cmp(&b.path)
            .then_with(|| a.export_name.cmp(&b.export_name))
            .then_with(|| a.line.cmp(&b.line))
    });

    let untested_file_count = files.len();
    let untested_export_count = exports.len();
    let wrapped_files: Vec<crate::health_types::UntestedFileFinding> = files
        .into_iter()
        .map(|file| crate::health_types::UntestedFileFinding::with_actions(file, root))
        .collect();
    let wrapped_exports: Vec<crate::health_types::UntestedExportFinding> = exports
        .into_iter()
        .map(|export| crate::health_types::UntestedExportFinding::with_actions(export, root))
        .collect();

    CoverageGapData {
        report: CoverageGaps {
            summary: build_coverage_summary(
                runtime_files,
                covered_files,
                untested_file_count,
                untested_export_count,
            ),
            files: wrapped_files,
            exports: wrapped_exports,
        },
        runtime_paths,
    }
}
