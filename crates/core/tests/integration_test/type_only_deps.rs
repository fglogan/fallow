use super::common::fixture_path;
use plow_config::{OutputFormat, PlowConfig, RulesConfig};

fn create_production_config(root: std::path::PathBuf) -> plow_config::ResolvedConfig {
    PlowConfig {
        schema: None,
        extends: vec![],
        entry: vec![],
        ignore_patterns: vec![],
        framework: vec![],
        workspaces: None,
        ignore_dependencies: vec![],
        ignore_unresolved_imports: vec![],
        ignore_exports: vec![],
        ignore_catalog_references: vec![],
        ignore_dependency_overrides: vec![],
        ignore_exports_used_in_file: plow_config::IgnoreExportsUsedInFileConfig::default(),
        used_class_members: vec![],
        ignore_decorators: vec![],
        duplicates: plow_config::DuplicatesConfig::default(),
        health: plow_config::HealthConfig::default(),
        rules: RulesConfig::default(),
        boundaries: plow_config::BoundaryConfig::default(),
        production: true.into(),
        plugins: vec![],
        rule_packs: vec![],
        dynamically_loaded: vec![],
        overrides: vec![],
        regression: None,
        audit: plow_config::AuditConfig::default(),
        codeowners: None,
        public_packages: vec![],
        flags: plow_config::FlagsConfig::default(),
        security: plow_config::SecurityConfig::default(),
        fix: plow_config::FixConfig::default(),
        resolve: plow_config::ResolveConfig::default(),
        sealed: false,
        include_entry_exports: false,
        auto_imports: false,
        cache: plow_config::CacheConfig::default(),
    }
    .resolve(root, OutputFormat::Human, 4, true, true, None)
}

#[test]
fn type_only_import_detected_in_production_mode() {
    let root = fixture_path("type-only-deps");
    let config = create_production_config(root);
    let results = plow_core::analyze(&config).expect("analysis should succeed");

    let type_only_names: Vec<&str> = results
        .type_only_dependencies
        .iter()
        .map(|d| d.dep.package_name.as_str())
        .collect();

    assert!(
        type_only_names.contains(&"zod"),
        "zod should be detected as type-only dependency, found: {type_only_names:?}"
    );

    assert!(
        !type_only_names.contains(&"express"),
        "express should NOT be type-only (has runtime import), found: {type_only_names:?}"
    );
}

#[test]
fn type_only_deps_not_reported_outside_production_mode() {
    let root = fixture_path("type-only-deps");
    let config = super::common::create_config(root);
    let results = plow_core::analyze(&config).expect("analysis should succeed");

    assert!(
        results.type_only_dependencies.is_empty(),
        "type_only_dependencies should be empty outside production mode, found: {:?}",
        results
            .type_only_dependencies
            .iter()
            .map(|d| d.dep.package_name.as_str())
            .collect::<Vec<_>>()
    );
}
