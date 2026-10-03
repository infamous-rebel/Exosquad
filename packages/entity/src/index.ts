// =============================================================================
// @exosquad/entity — Public API
// =============================================================================

// Types
export type {
  OrganizationRole,
  OrgIdentityStatus,
  OrgMatchDecision,
  CommercialRelationshipType,
  ObservationType,
  IdentifierMatchQuality,
  DomainMatchQuality,
  EmailMatchQuality,
  PhoneMatchQuality,
  AddressMatchQuality,
  CountryMatchQuality,
  NameMatchQuality,
  WebsiteMatchQuality,
  RoleCompatibility,
  OrgConflictType,
  ConflictSeverity,
  OrgMergeAction,
  OrgActorType,
  OrgMatchMethod,
  OrgCandidateMethod,
  OrgCandidateStatus,
  NormalizedCompanyName,
  NormalizedDomain,
  NormalizedEmail,
  NormalizedPhone,
  NormalizedAddress,
  OrgIdentityInput,
  OrgMatchEvidence,
  OrgMatchResult,
  OrgAIMatchRequest,
  OrgAIMatchResponse,
  OrgAIProvider,
  DetectedOrgConflict,
  OrgCandidatePair,
  OrgResolutionResult,
} from "./types.js";

// Company name normalization
export {
  normalizeCompanyName,
  createCompanySearchKey,
  isCompanyNameEquivalent,
  companyNameSimilarity,
} from "./company-name.js";

// Domain normalization
export {
  normalizeDomain,
  isDomainEquivalent,
  isCorporateDomain,
  isFreeEmailDomain,
} from "./domain.js";

// Email normalization
export {
  normalizeEmail,
  isEmailEquivalent,
  isEmailDomainMatch,
} from "./email.js";

// Phone normalization
export {
  normalizePhone,
  isPhoneEquivalent,
} from "./phone.js";

// Address normalization
export {
  normalizeAddress,
  addressSimilarity,
} from "./address.js";

// Similarity engine
export {
  compareOrganizations,
} from "./similarity.js";

// Candidate generation
export {
  generateOrgBlockingKeys,
  generateOrgCandidates,
  generateOrgCandidatesForOrg,
} from "./candidates.js";

// Conflict detection
export {
  detectOrgConflicts,
} from "./conflicts.js";

// AI provider
export {
  NoOpOrgAIProvider,
  HttpOrgAIProvider,
  createOrgAIProvider,
} from "./ai-provider.js";

// Resolver
export {
  OrgEntityResolver,
  type OrgResolverConfig,
} from "./resolver.js";
