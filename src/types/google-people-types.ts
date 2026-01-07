/**
 * Google People API Types
 * Requirements: directory-people-search 4.1, 4.2
 *
 * Type definitions for directory people search functionality.
 */

/**
 * Represents a person from the organization directory
 * Requirement: 4.1 - Search result format
 */
export interface DirectoryPerson {
  /** People API resource name (e.g., "people/c12345") */
  resourceName: string;
  /** Display name of the person */
  displayName: string;
  /** Primary email address */
  emailAddress: string;
  /** Department or organization (if available) */
  organization?: string;
  /** Profile photo URL (if available) */
  photoUrl?: string;
}

/**
 * Input parameters for searching directory people
 * Requirement: 1.1 - Search with query parameter
 */
export interface SearchDirectoryPeopleInput {
  /** Search query (name or email prefix) */
  query: string;
  /** Maximum number of results (default: 20, max: 50) */
  pageSize?: number;
}

/**
 * Response from directory people search
 * Requirement: 4.2 - Include total results count
 */
export interface SearchDirectoryPeopleResponse {
  /** Whether the search was successful */
  success: boolean;
  /** List of matching people */
  people: DirectoryPerson[];
  /** Total number of results found */
  totalResults: number;
  /** Human-readable message */
  message: string;
}
