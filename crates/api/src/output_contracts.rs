//! Concrete output-contract aliases shared by schema and adapter crates.

pub type AuditOutput = plow_output::AuditOutput<
    crate::AuditVerdict,
    crate::AuditSummary,
    crate::AuditAttribution,
    plow_output::CheckOutput,
    crate::DupesReportPayload,
    plow_output::HealthReport,
>;

pub type CombinedOutput = plow_output::CombinedOutput<
    plow_output::CheckOutput,
    crate::DupesReportPayload,
    plow_output::HealthReport,
>;

pub type ListBoundariesOutput =
    plow_output::ListBoundariesOutput<plow_config::LogicalGroupStatus, plow_config::AuthoredRule>;

pub type WorkspacesOutput = plow_output::WorkspacesOutput<plow_config::WorkspaceDiagnostic>;

pub type BoundariesListing =
    plow_output::BoundariesListing<plow_config::LogicalGroupStatus, plow_config::AuthoredRule>;

pub type BoundariesListZone = plow_output::BoundariesListZone;

pub type BoundariesListRule = plow_output::BoundariesListRule;

pub type BoundariesListLogicalGroup = plow_output::BoundariesListLogicalGroup<
    plow_config::LogicalGroupStatus,
    plow_config::AuthoredRule,
>;

pub type ListOutput = plow_output::ListOutput<BoundariesListing, plow_config::WorkspaceDiagnostic>;

pub type ListEntryPointOutput = plow_output::ListEntryPointOutput;

pub type ListPluginOutput = plow_output::ListPluginOutput;

pub type SecurityGate = plow_output::SecurityGate<crate::SecurityGateMode>;

pub type SecurityOutputConfig = plow_output::SecurityOutputConfig<plow_config::Severity>;

pub type SecuritySummaryOutput =
    plow_output::SecuritySummaryOutput<SecurityOutputConfig, SecurityGate>;

pub type SecurityOutput = plow_output::SecurityOutput<SecurityOutputConfig, SecurityGate>;

#[allow(
    clippy::type_complexity,
    reason = "concrete root union intentionally fills every output payload slot"
)]
pub type PlowOutput = plow_output::PlowOutput<
    AuditOutput,
    plow_output::ExplainOutput,
    plow_output::InspectOutput,
    plow_types::trace_chain::SymbolChainTrace,
    plow_output::ReviewEnvelopeOutput,
    plow_output::ReviewReconcileOutput,
    plow_output::CoverageSetupOutput,
    plow_output::CoverageAnalyzeOutput,
    ListBoundariesOutput,
    WorkspacesOutput,
    plow_output::HealthOutput<plow_output::HealthReport, plow_output::HealthGroup>,
    plow_output::DupesOutput<crate::DupesReportPayload, crate::DuplicationGroup>,
    plow_output::CheckGroupedOutput,
    plow_output::ImpactReport,
    plow_output::CrossRepoImpactReport,
    SecuritySummaryOutput,
    SecurityOutput,
    plow_output::SecuritySurvivorsOutput,
    plow_output::SecurityBlindSpotsOutput,
    plow_output::CheckOutput,
    CombinedOutput,
    plow_output::FeatureFlagsOutput,
    plow_output::StandardReviewBriefOutput,
    plow_output::DecisionSurfaceOutput,
    plow_output::StandardWalkthroughGuide,
    plow_output::WalkthroughValidation,
>;
