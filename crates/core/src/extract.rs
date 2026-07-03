//! Re-exports from `plow-extract`.
//!
//! All parsing/extraction logic has been moved to the `plow-extract` crate.
//! This module provides backwards-compatible re-exports so that
//! `plow_core::extract::*` paths continue to resolve.

pub use plow_extract::{
    DynamicImportInfo, DynamicImportPattern, ExportInfo, ExportName, ImportInfo, ImportedName,
    MemberAccess, MemberInfo, MemberKind, ModuleInfo, ParseResult, ReExportInfo, RequireCallInfo,
    VisibilityTag,
};
pub use plow_types::extract::{SkippedSecurityCalleeExpressionKind, SkippedSecurityCalleeReason};

pub use plow_extract::{
    MarkupClassScan, MarkupClassToken, TailwindArbitraryUse, ThemeScan, ThemeTokenDef,
    compute_css_analytics, extract_apply_tokens, extract_astro_frontmatter,
    extract_astro_style_regions, extract_astro_template_regions, extract_css_module_exports,
    extract_mdx_statements, extract_sfc_scripts, extract_sfc_styles, extract_sfc_template_regions,
    is_edit_distance_one, is_glimmer_file, is_sfc_file, is_typo_edit, parse_all_files,
    parse_from_content, parse_single_file, scan_markup_class_tokens,
    scan_tailwind_arbitrary_values, scan_theme_blocks, scoped_unused_classes,
    sfc_virtual_stylesheet, strip_glimmer_templates,
};

pub use plow_extract::astro;
pub use plow_extract::css;
pub use plow_extract::flags;
pub use plow_extract::inventory;
pub use plow_extract::mdx;
pub use plow_extract::sfc;
pub use plow_extract::visitor;
