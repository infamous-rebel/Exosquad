// =============================================================================
// @exosquad/entity — Types for commercial entity identity resolution
// =============================================================================

/** Commercial entity roles. */
export type OrganizationRole =
  | "SELLER"
  | "SUPPLIER"
  | "DISTRIBUTOR"
  | "IMPORTER"
  | "WHOLESALER"
  | "MANUFACTURER"
  | "BRAND_OWNER";

/** Organization identity status. */
export type OrgIdentityStatus =
  | "unresolved"
  | "resolved"
  | "high_confidence"
  | "possible"
  | "ambiguous"
  | "conflict";

/** Match decision for organization identity. */
export type OrgMatchDecision =
  | "EXACT_MATCH"
  | "HIGH_CONFIDENCE_MATCH"
  | "POSSIBLE_MATCH"
  | "NO_MATCH"
  | "CONFLICT"
  | "UNRESOLVED";

/** Commercial relationship types. */
export type CommercialRelationshipType =
  | "SELLS_TO"
  | "SUPPLIES"
  | "DISTRIBUTES"
  | "IMPORTS"
  | "WHOLESALES"
  | "MANUFACTURES_FOR"
  | "OWNS_BRAND"
  | "AUTHORIZED_DISTRIBUTOR_OF"
  | "OPERATES_DOMAIN"
  | "PARTNER_OF";

/** Observation type for relationships. */
export type ObservationType = "observed" | "inferred" | "probable";

/** Identifier match quality. */
export type IdentifierMatchQuality = "exact" | "partial" | "none" | "conflict";

/** Domain match quality. */
export type DomainMatchQuality = "exact" | "similar" | "none" | "conflict";

/** Email match quality. */
export type EmailMatchQuality = "exact" | "domain" | "none";

/** Phone match quality. */
export type PhoneMatchQuality = "exact" | "none" | "conflict";

/** Address match quality. */
export type AddressMatchQuality = "exact" | "similar" | "none";

/** Country match quality. */
export type CountryMatchQuality = "exact" | "compatible" | "different" | "none";

/** Name match quality. */
export type NameMatchQuality = "exact" | "high" | "medium" | "low" | "none";

/** Website match quality. */
export type WebsiteMatchQuality = "exact" | "similar" | "none";

/** Role compatibility. */
export type RoleCompatibility = "compatible" | "neutral" | "conflicting";

/** Conflict types for organizations. */
export type OrgConflictType =
  | "registration_collision"
  | "domain_conflict"
  | "name_conflict"
  | "phone_conflict"
  | "email_conflict"
  | "source_id_conflict";

/** Conflict severity. */
export type ConflictSeverity = "low" | "medium" | "high" | "critical";

/** Merge action types. */
export type OrgMergeAction = "merged" | "split" | "superseded" | "overridden";

/** Actor type. */
export type OrgActorType = "system" | "ai" | "manual";

/** Match method. */
export type OrgMatchMethod = "deterministic" | "ai" | "manual" | "hybrid";

/** Candidate generation method. */
export type OrgCandidateMethod = "blocking" | "identifier" | "domain" | "manual" | "ai";

/** Candidate status. */
export type OrgCandidateStatus =
  | "pending"
  | "processing"
  | "matched"
  | "rejected"
  | "ambiguous"
  | "failed";

// ─── Normalized Organization ─────────────────────────────────────────────────

/** Normalized company name result. */
export interface NormalizedCompanyName {
  originalName: string;
  normalizedName: string;
  searchKey: string;
  legalSuffix: string | null;
  coreName: string;
}

/** Normalized domain result. */
export interface NormalizedDomain {
  original: string;
  normalized: string;
  hostname: string;
  registrableDomain: string;
  isSubdomain: boolean;
}

/** Normalized email result. */
export interface NormalizedEmail {
  original: string;
  normalized: string;
  localPart: string;
  domain: string;
  isCorporate: boolean;
}

/** Normalized phone result. */
export interface NormalizedPhone {
  original: string;
  e164: string | null;
  countryCode: string | null;
  nationalNumber: string | null;
  isValid: boolean;
}

/** Normalized address result. */
export interface NormalizedAddress {
  original: string;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  normalizedForComparison: string;
}

// ─── Organization Input ──────────────────────────────────────────────────────

/** Organization data for identity resolution. */
export interface OrgIdentityInput {
  id: string;
  tenantId: string;
  canonicalName: string;
  normalizedName: string;
  searchKey: string;
  legalName: string | null;
  tradingName: string | null;
  website: string | null;
  domain: string | null;
  country: string | null;
  identifiers: Array<{
    type: string;
    value: string;
    normalized: string;
  }>;
  domains: string[];
  emails: Array<{
    email: string;
    normalizedEmail: string;
    domain: string;
    isCorporate: boolean;
  }>;
  phones: Array<{
    rawPhone: string;
    normalizedPhone: string | null;
    countryCode: string | null;
  }>;
  locations: Array<{
    city: string | null;
    state: string | null;
    country: string | null;
    postalCode: string | null;
  }>;
  roles: string[];
}

// ─── Matching Evidence ───────────────────────────────────────────────────────

/** Structured matching evidence for organization comparison. */
export interface OrgMatchEvidence {
  nameMatch: NameMatchQuality;
  domainMatch: DomainMatchQuality;
  emailMatch: EmailMatchQuality;
  phoneMatch: PhoneMatchQuality;
  addressMatch: AddressMatchQuality;
  registrationMatch: IdentifierMatchQuality;
  sourceIdMatch: IdentifierMatchQuality;
  countryMatch: CountryMatchQuality;
  websiteMatch: WebsiteMatchQuality;
  roleCompatibility: RoleCompatibility;
  conflictState: string;
  sourceReliability: number | null;
  scores: {
    nameScore: number;
    domainScore: number;
    emailScore: number;
    phoneScore: number;
    addressScore: number;
    identifierScore: number;
    overallScore: number;
  };
  reasons: string[];
}

/** Result of comparing two organizations. */
export interface OrgMatchResult {
  decision: OrgMatchDecision;
  confidence: number;
  evidence: OrgMatchEvidence;
  reasons: string[];
}

// ─── AI Provider Types ───────────────────────────────────────────────────────

/** AI organization matching request. */
export interface OrgAIMatchRequest {
  orgA: {
    name: string;
    legalName: string | null;
    domain: string | null;
    country: string | null;
    identifiers: string[];
    roles: string[];
  };
  orgB: {
    name: string;
    legalName: string | null;
    domain: string | null;
    country: string | null;
    identifiers: string[];
    roles: string[];
  };
}

/** AI organization matching response. */
export interface OrgAIMatchResponse {
  decision: OrgMatchDecision;
  confidence: number;
  reasons: string[];
}

/** AI provider interface for organization matching. */
export interface OrgAIProvider {
  readonly name: string;
  readonly available: boolean;
  matchOrganizations(request: OrgAIMatchRequest): Promise<OrgAIMatchResponse>;
}

// ─── Conflict & Candidate Types ──────────────────────────────────────────────

/** Detected organization conflict. */
export interface DetectedOrgConflict {
  conflictType: OrgConflictType;
  severity: ConflictSeverity;
  description: string;
  entityId: string;
  conflictingData: Record<string, unknown>;
}

/** A candidate pair for organization resolution. */
export interface OrgCandidatePair {
  fromOrgId: string;
  toOrgId: string;
  generationMethod: OrgCandidateMethod;
  blockingKey: string | null;
  priority: number;
}

// ─── Resolution Result ───────────────────────────────────────────────────────

/** Result of resolving an organization candidate pair. */
export interface OrgResolutionResult {
  candidate: OrgCandidatePair;
  matchResult: OrgMatchResult;
  aiUsed: boolean;
  conflicts: DetectedOrgConflict[];
  autoApplicable: boolean;
}
