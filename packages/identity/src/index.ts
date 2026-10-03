// =============================================================================
// @exosquad/identity — Public API
// =============================================================================
// Single entry point for the identity resolution package.
// =============================================================================

// Types
export type {
  MatchDecision,
  IdentityStatus,
  RelationshipType,
  IdentifierMatchQuality,
  BrandMatchQuality,
  NameMatchQuality,
  VariantMatchQuality,
  QuantityMatchQuality,
  PackMatchQuality,
  CountryMatchQuality,
  ManufacturerMatchQuality,
  ConflictType,
  ConflictSeverity,
  ConflictStatus,
  MergeAction,
  ActorType,
  MatchMethod,
  CandidateGenerationMethod,
  CandidateStatus,
  ProductToken,
  MatchEvidence,
  MatchResult,
  ProductIdentityInput,
  AIMatchRequest,
  AIMatchResponse,
  AIProvider,
  DetectedConflict,
  CandidatePair,
} from "./types.js";

// Tokenizer
export {
  tokenizeProductName,
  tokenizeFromComponents,
  hasSignificantVariant,
  getBlockingKey,
} from "./tokenizer.js";

// Similarity engine
export {
  compareProducts,
  jaccardSimilarity,
  bigramSimilarity,
  type ComparableProduct,
} from "./similarity.js";

// Candidate generation
export {
  generateBlockingKeys,
  generateCandidates,
  generateCandidatesForProduct,
} from "./candidates.js";

// Conflict detection
export {
  detectConflicts,
} from "./conflicts.js";

// AI provider
export {
  NoOpAIProvider,
  HttpAIProvider,
  createAIProvider,
} from "./ai-provider.js";

// Resolver
export {
  IdentityResolver,
  buildComparableProduct,
  type ResolverConfig,
  type ResolutionResult,
} from "./resolver.js";
