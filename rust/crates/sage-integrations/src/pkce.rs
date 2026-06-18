//! PKCE (S256) — port of `src/google-oauth/pkce.ts` (RFC 7636).

use base64::{engine::general_purpose::STANDARD_NO_PAD, Engine as _};
use rand::RngCore;
use sha2::{Digest, Sha256};

const UNRESERVED_CHARS: &[u8] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
const DEFAULT_VERIFIER_LENGTH: usize = 64;
const MIN_VERIFIER_LENGTH: usize = 43;
const MAX_VERIFIER_LENGTH: usize = 128;

/// Generate a random code verifier (length clamped to [43, 128], default 64).
pub fn generate_code_verifier(length: usize) -> String {
    let valid_length = length.clamp(MIN_VERIFIER_LENGTH, MAX_VERIFIER_LENGTH);
    let mut bytes = vec![0u8; valid_length];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes
        .iter()
        .map(|b| UNRESERVED_CHARS[(*b as usize) % UNRESERVED_CHARS.len()] as char)
        .collect()
}

pub fn default_verifier() -> String {
    generate_code_verifier(DEFAULT_VERIFIER_LENGTH)
}

/// `BASE64URL(SHA256(code_verifier))`, no padding. Verifier hashed as ASCII bytes.
pub fn generate_code_challenge(code_verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(code_verifier.as_bytes());
    let digest = hasher.finalize();
    // base64 then url-safe substitution (matches the TS replace chain).
    let b64 = STANDARD_NO_PAD.encode(digest);
    b64.replace('+', "-").replace('/', "_")
}

pub fn verify_code_challenge(code_verifier: &str, code_challenge: &str) -> bool {
    generate_code_challenge(code_verifier) == code_challenge
}

pub fn is_valid_code_verifier(code_verifier: &str) -> bool {
    let len = code_verifier.len();
    if !(MIN_VERIFIER_LENGTH..=MAX_VERIFIER_LENGTH).contains(&len) {
        return false;
    }
    code_verifier
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~'))
}

pub fn is_valid_code_challenge(code_challenge: &str) -> bool {
    if code_challenge.len() != 43 {
        return false;
    }
    code_challenge
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rfc7636_challenge_vector() {
        // RFC 7636 Appendix B example.
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        let challenge = generate_code_challenge(verifier);
        assert_eq!(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
        assert!(verify_code_challenge(verifier, &challenge));
        assert!(is_valid_code_verifier(verifier));
        assert!(is_valid_code_challenge(&challenge));
    }

    #[test]
    fn verifier_length_clamping_and_charset() {
        assert_eq!(generate_code_verifier(10).len(), MIN_VERIFIER_LENGTH);
        assert_eq!(generate_code_verifier(9999).len(), MAX_VERIFIER_LENGTH);
        assert_eq!(default_verifier().len(), DEFAULT_VERIFIER_LENGTH);
        assert!(is_valid_code_verifier(&default_verifier()));
    }

    #[test]
    fn invalid_inputs_rejected() {
        assert!(!is_valid_code_verifier("short"));
        assert!(!is_valid_code_verifier(&"a".repeat(200)));
        assert!(!is_valid_code_verifier(
            "has space aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        ));
        assert!(!is_valid_code_challenge("tooshort"));
    }
}
