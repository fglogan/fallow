//! Re-exports from `plow-extract`.
//!
//! All parsing/extraction logic has been moved to the `plow-extract` crate.
//! This module provides backwards-compatible re-exports so that
//! `plow_core::extract::*` paths continue to resolve.

pub use plow_extract::{
    ANGULAR_TPL_SENTINEL, DynamicImportInfo, DynamicImportPattern, ExportInfo, ExportName,
    FACTORY_CALL_SENTINEL, FLUENT_CHAIN_NEW_SENTINEL, FLUENT_CHAIN_SENTINEL,
    INSTANCE_EXPORT_SENTINEL, ImportInfo, ImportedName, MemberAccess, MemberInfo, MemberKind,
    ModuleInfo, PLAYWRIGHT_FIXTURE_ALIAS_SENTINEL, PLAYWRIGHT_FIXTURE_DEF_SENTINEL,
    PLAYWRIGHT_FIXTURE_TYPE_SENTINEL, PLAYWRIGHT_FIXTURE_USE_SENTINEL, ParseResult, ReExportInfo,
    RequireCallInfo, VisibilityTag,
};
pub use plow_types::extract::{SkippedSecurityCalleeExpressionKind, SkippedSecurityCalleeReason};

pub use plow_extract::{
    extract_astro_frontmatter, extract_css_module_exports, extract_mdx_statements,
    extract_sfc_scripts, is_glimmer_file, is_sfc_file, parse_all_files, parse_from_content,
    parse_single_file, strip_glimmer_templates,
};

pub use plow_extract::astro;
pub use plow_extract::css;
pub use plow_extract::flags;
pub use plow_extract::inventory;
pub use plow_extract::mdx;
pub use plow_extract::sfc;
pub use plow_extract::visitor;
