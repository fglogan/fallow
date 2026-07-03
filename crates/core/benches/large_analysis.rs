#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    reason = "tests and benches use unwrap and expect to keep fixture setup concise"
)]
#![expect(
    deprecated,
    reason = "ADR-008: benchmark exercises the workspace path-dep plow_core::analyze surface"
)]

use criterion::{BatchSize, Criterion, criterion_group, criterion_main};
use tempfile::TempDir;

mod helpers;

struct ConfigInput {
    _temp_dir: TempDir,
    config: plow_config::ResolvedConfig,
}

struct DupesInput {
    _temp_dir: TempDir,
    root: std::path::PathBuf,
    files: Vec<plow_core::discover::DiscoveredFile>,
    config: plow_config::DuplicatesConfig,
}

fn create_config_input(name: &str, file_count: usize, no_cache: bool) -> ConfigInput {
    let (temp_dir, config) =
        helpers::create_synthetic_project_with_cache(name, file_count, no_cache);
    ConfigInput {
        _temp_dir: temp_dir,
        config,
    }
}

fn create_warm_config_input(name: &str, file_count: usize) -> ConfigInput {
    let input = create_config_input(name, file_count, false);
    let _ = plow_core::analyze(&input.config);
    input
}

fn create_dupes_input(name: &str, file_count: usize) -> DupesInput {
    let (temp_dir, resolved_config) = helpers::create_dupe_project(name, file_count);
    let files = plow_core::discover::discover_files(&resolved_config);
    DupesInput {
        _temp_dir: temp_dir,
        root: resolved_config.root,
        files,
        config: plow_config::DuplicatesConfig::default(),
    }
}

fn bench_large_analysis(c: &mut Criterion) {
    let mut group = c.benchmark_group("large_analysis");

    group.bench_function("full_pipeline_5000_files", |bencher| {
        bencher.iter_batched_ref(
            || create_config_input("5000", 5000, true),
            |input| plow_core::analyze(&input.config),
            BatchSize::LargeInput,
        );
    });

    group.bench_function("full_pipeline_1000_files_warm_cache", |bencher| {
        bencher.iter_batched_ref(
            || create_warm_config_input("1000-warm", 1000),
            |input| plow_core::analyze(&input.config),
            BatchSize::LargeInput,
        );
    });

    group.bench_function("full_pipeline_5000_files_warm_cache", |bencher| {
        bencher.iter_batched_ref(
            || create_warm_config_input("5000-warm", 5000),
            |input| plow_core::analyze(&input.config),
            BatchSize::LargeInput,
        );
    });

    group.bench_function("dupes_full_pipeline_1000_files", |bencher| {
        bencher.iter_batched_ref(
            || create_dupes_input("1000", 1000),
            |input| {
                plow_core::duplicates::find_duplicates(&input.root, &input.files, &input.config);
            },
            BatchSize::LargeInput,
        );
    });

    group.bench_function("dupes_full_pipeline_5000_files", |bencher| {
        bencher.iter_batched_ref(
            || create_dupes_input("5000", 5000),
            |input| {
                plow_core::duplicates::find_duplicates(&input.root, &input.files, &input.config);
            },
            BatchSize::LargeInput,
        );
    });

    group.finish();
}

criterion_group!(benches, bench_large_analysis);
criterion_main!(benches);
