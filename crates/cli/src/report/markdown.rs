use crate::report::sink::outln;
use std::path::Path;

use plow_api::ResultGroup;
use plow_types::duplicates::DuplicationReport;
use plow_types::results::AnalysisResults;

pub(super) fn print_markdown(results: &AnalysisResults, root: &Path) {
    outln!("{}", plow_api::build_markdown(results, root));
}

pub(super) fn print_grouped_markdown(groups: &[ResultGroup], root: &Path) {
    outln!("{}", plow_api::build_grouped_markdown(groups, root));
}

pub(super) fn print_duplication_markdown(report: &DuplicationReport, root: &Path) {
    outln!("{}", plow_api::build_duplication_markdown(report, root));
}

pub(super) fn print_health_markdown(report: &plow_output::HealthReport, root: &Path) {
    outln!("{}", plow_api::build_health_markdown(report, root));
}
