use std::path::PathBuf;

use plow_config::{ConfigOverride, OutputFormat, PartialRulesConfig, PlowConfig, RulesConfig};

pub fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("tests")
        .join("fixtures")
        .join(name)
}

pub fn create_config(root: PathBuf) -> plow_config::ResolvedConfig {
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
        unused_component_props: plow_config::UnusedComponentPropsConfig::default(),
        duplicates: plow_config::DuplicatesConfig::default(),
        health: plow_config::HealthConfig::default(),
        rules: RulesConfig::default(),
        boundaries: plow_config::BoundaryConfig::default(),
        production: false.into(),
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

/// A config with `unusedComponentProps.ignorePattern` set, used to exercise the
/// opt-in prop-exemption knob. Everything else defaults.
pub fn create_config_with_unused_props_ignore(
    root: PathBuf,
    ignore_pattern: &str,
) -> plow_config::ResolvedConfig {
    PlowConfig {
        unused_component_props: plow_config::UnusedComponentPropsConfig {
            ignore_pattern: Some(ignore_pattern.to_string()),
        },
        ..Default::default()
    }
    .resolve(root, OutputFormat::Human, 4, true, true, None)
}

pub fn create_config_with_cache(
    root: PathBuf,
    cache_dir: std::path::PathBuf,
) -> plow_config::ResolvedConfig {
    let mut config = PlowConfig {
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
        unused_component_props: plow_config::UnusedComponentPropsConfig::default(),
        duplicates: plow_config::DuplicatesConfig::default(),
        health: plow_config::HealthConfig::default(),
        rules: RulesConfig::default(),
        boundaries: plow_config::BoundaryConfig::default(),
        production: false.into(),
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
    .resolve(root, OutputFormat::Human, 4, false, true, None); // no_cache = false to enable caching
    config.cache_dir = cache_dir;
    config
}

pub fn create_config_with_rules<F>(root: PathBuf, modify: F) -> plow_config::ResolvedConfig
where
    F: FnOnce(&mut RulesConfig),
{
    let mut rules = RulesConfig::default();
    modify(&mut rules);
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
        unused_component_props: plow_config::UnusedComponentPropsConfig::default(),
        duplicates: plow_config::DuplicatesConfig::default(),
        health: plow_config::HealthConfig::default(),
        rules,
        boundaries: plow_config::BoundaryConfig::default(),
        production: false.into(),
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

pub fn create_config_with_overrides(
    root: PathBuf,
    overrides: Vec<(&str, PartialRulesConfig)>,
) -> plow_config::ResolvedConfig {
    let overrides = overrides
        .into_iter()
        .map(|(glob, rules)| ConfigOverride {
            files: vec![glob.to_string()],
            rules,
        })
        .collect();
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
        unused_component_props: plow_config::UnusedComponentPropsConfig::default(),
        duplicates: plow_config::DuplicatesConfig::default(),
        health: plow_config::HealthConfig::default(),
        rules: RulesConfig::default(),
        boundaries: plow_config::BoundaryConfig::default(),
        production: false.into(),
        plugins: vec![],
        rule_packs: vec![],
        dynamically_loaded: vec![],
        overrides,
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

pub fn create_config_with_ignore_decorators(
    root: PathBuf,
    ignore_decorators: Vec<String>,
) -> plow_config::ResolvedConfig {
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
        ignore_decorators,
        unused_component_props: plow_config::UnusedComponentPropsConfig::default(),
        duplicates: plow_config::DuplicatesConfig::default(),
        health: plow_config::HealthConfig::default(),
        rules: RulesConfig::default(),
        boundaries: plow_config::BoundaryConfig::default(),
        production: false.into(),
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
