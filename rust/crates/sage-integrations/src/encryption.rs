//! AES-256-GCM encryption service — port of `src/google-oauth/encryption-service.ts`.
//!
//! Byte-compatible with the TS format `salt:iv:authTag:encrypted` (all hex):
//! - key derivation: scrypt(passphrase = key string utf8, salt = 16B, N=16384/r=8/p=1, len=32)
//! - 16-byte IV (Node uses a 16-byte IV for aes-256-gcm), 16-byte GCM tag.
//!
//! A Rust build can therefore decrypt `~/.sage/*.enc` written by the TS server.

use aes_gcm::aead::consts::U16;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::aes::Aes256;
use aes_gcm::{AesGcm, Key, Nonce};
use rand::RngCore;
use scrypt::{scrypt, Params};
use std::path::{Path, PathBuf};

/// AES-256-GCM with a 16-byte nonce (matches Node's `createCipheriv('aes-256-gcm', key, iv16)`).
type Aes256Gcm16 = AesGcm<Aes256, U16>;

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("invalid encrypted data format")]
    InvalidFormat,
    #[error("encryption failed")]
    EncryptFailed,
    #[error("decryption failed")]
    DecryptFailed,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

pub struct EncryptionService {
    key: String,
    key_storage_path: PathBuf,
}

fn default_key_path() -> PathBuf {
    dirs::home_dir()
        .map(|h| h.join(".sage").join("oauth_encryption_key"))
        .unwrap_or_else(|| PathBuf::from(".sage/oauth_encryption_key"))
}

/// Create/overwrite a file owner-readable only (0600 on unix), with the mode
/// applied AT CREATION so the file is never momentarily world-readable (the TS
/// wrote-then-chmod'd, leaving a brief window).
fn write_private(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut f = opts.open(path)?;
    f.write_all(contents)
}

/// Create a directory (recursive) restricted to the owner (0700 on unix).
fn create_private_dir(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        std::fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(path)
    }
    #[cfg(not(unix))]
    {
        std::fs::create_dir_all(path)
    }
}

impl EncryptionService {
    /// Construct with an explicit key (tests / injected config).
    pub fn with_key(key: String) -> Self {
        Self {
            key,
            key_storage_path: default_key_path(),
        }
    }

    /// Load/generate the key. Priority: `SAGE_ENCRYPTION_KEY` env → key file →
    /// generate a 32-byte hex key and persist it (0600). Mirrors the TS
    /// `initialize()`.
    pub fn initialize(key_storage_path: Option<PathBuf>) -> Result<Self, CryptoError> {
        let key_storage_path = key_storage_path.unwrap_or_else(default_key_path);

        if let Ok(env_key) = std::env::var("SAGE_ENCRYPTION_KEY") {
            if !env_key.is_empty() {
                return Ok(Self {
                    key: env_key,
                    key_storage_path,
                });
            }
        }
        if key_storage_path.exists() {
            if let Ok(contents) = std::fs::read_to_string(&key_storage_path) {
                return Ok(Self {
                    key: contents.trim().to_string(),
                    key_storage_path,
                });
            }
        }
        // Generate + persist.
        let mut raw = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut raw);
        let key = hex::encode(raw);
        if let Some(parent) = key_storage_path.parent() {
            create_private_dir(parent)?;
        }
        write_private(&key_storage_path, key.as_bytes())?;
        Ok(Self {
            key,
            key_storage_path,
        })
    }

    fn derive_key(&self, salt: &[u8]) -> Result<[u8; 32], CryptoError> {
        // Node scrypt defaults: N=16384 (log_n 14), r=8, p=1, keylen 32.
        let params = Params::new(14, 8, 1, 32).map_err(|_| CryptoError::EncryptFailed)?;
        let mut out = [0u8; 32];
        scrypt(self.key.as_bytes(), salt, &params, &mut out)
            .map_err(|_| CryptoError::EncryptFailed)?;
        Ok(out)
    }

    /// Encrypt to `salt:iv:authTag:encrypted` (hex).
    pub fn encrypt(&self, data: &str) -> Result<String, CryptoError> {
        let mut salt = [0u8; 16];
        let mut iv = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut salt);
        rand::thread_rng().fill_bytes(&mut iv);

        let key = self.derive_key(&salt)?;
        let cipher = Aes256Gcm16::new(Key::<Aes256Gcm16>::from_slice(&key));
        let combined = cipher
            .encrypt(Nonce::<U16>::from_slice(&iv), data.as_bytes())
            .map_err(|_| CryptoError::EncryptFailed)?;
        // aes-gcm appends the 16-byte tag; the TS format separates it.
        let (ciphertext, tag) = combined.split_at(combined.len() - 16);
        Ok(format!(
            "{}:{}:{}:{}",
            hex::encode(salt),
            hex::encode(iv),
            hex::encode(tag),
            hex::encode(ciphertext)
        ))
    }

    pub fn decrypt(&self, encrypted: &str) -> Result<String, CryptoError> {
        let parts: Vec<&str> = encrypted.split(':').collect();
        if parts.len() != 4 {
            return Err(CryptoError::InvalidFormat);
        }
        let salt = hex::decode(parts[0]).map_err(|_| CryptoError::InvalidFormat)?;
        let iv = hex::decode(parts[1]).map_err(|_| CryptoError::InvalidFormat)?;
        let tag = hex::decode(parts[2]).map_err(|_| CryptoError::InvalidFormat)?;
        let ciphertext = hex::decode(parts[3]).map_err(|_| CryptoError::InvalidFormat)?;
        if iv.len() != 16 {
            return Err(CryptoError::InvalidFormat);
        }

        let key = self.derive_key(&salt)?;
        let cipher = Aes256Gcm16::new(Key::<Aes256Gcm16>::from_slice(&key));
        let mut combined = ciphertext;
        combined.extend_from_slice(&tag);
        let plaintext = cipher
            .decrypt(Nonce::<U16>::from_slice(&iv), combined.as_slice())
            .map_err(|_| CryptoError::DecryptFailed)?;
        String::from_utf8(plaintext).map_err(|_| CryptoError::DecryptFailed)
    }

    /// Encrypt + atomic write (temp file + rename), 0600.
    pub fn encrypt_to_file(&self, data: &str, path: &Path) -> Result<(), CryptoError> {
        let encrypted = self.encrypt(data)?;
        if let Some(parent) = path.parent() {
            create_private_dir(parent)?;
        }
        let temp = path.with_extension("tmp");
        // Temp written 0600-at-creation so encrypted tokens are never momentarily readable.
        write_private(&temp, encrypted.as_bytes())?;
        std::fs::rename(&temp, path)?;
        Ok(())
    }

    /// Decrypt a file, or `None` if it doesn't exist.
    pub fn decrypt_from_file(&self, path: &Path) -> Result<Option<String>, CryptoError> {
        if !path.exists() {
            return Ok(None);
        }
        let encrypted = std::fs::read_to_string(path)?;
        self.decrypt(&encrypted).map(Some)
    }

    pub fn key_storage_path(&self) -> &Path {
        &self.key_storage_path
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_encrypt_decrypt() {
        let svc = EncryptionService::with_key("test-key-at-least-32-characters-long-xx".into());
        let plaintext = "refresh_token=ya29.secret;user=sh1";
        let enc = svc.encrypt(plaintext).unwrap();
        // Format: 4 hex segments.
        let parts: Vec<&str> = enc.split(':').collect();
        assert_eq!(parts.len(), 4);
        assert_eq!(parts[0].len(), 32); // 16-byte salt hex
        assert_eq!(parts[1].len(), 32); // 16-byte iv hex
        assert_eq!(parts[2].len(), 32); // 16-byte tag hex
        assert_eq!(svc.decrypt(&enc).unwrap(), plaintext);
    }

    #[test]
    fn decrypt_rejects_tampered_and_wrong_format() {
        let svc = EncryptionService::with_key("k".repeat(40));
        let enc = svc.encrypt("data").unwrap();
        let mut bytes: Vec<&str> = enc.split(':').collect();
        // Tamper the ciphertext → GCM tag check fails.
        let tampered = format!("{}:{}:{}:{}", bytes[0], bytes[1], bytes[2], "00".repeat(8));
        assert!(svc.decrypt(&tampered).is_err());
        bytes.pop();
        assert!(matches!(
            svc.decrypt(&bytes.join(":")),
            Err(CryptoError::InvalidFormat)
        ));
    }

    #[test]
    fn file_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let svc = EncryptionService::with_key("file-test-key-32-characters-minimum-xx".into());
        let path = dir.path().join("tokens.enc");
        assert!(svc.decrypt_from_file(&path).unwrap().is_none());
        svc.encrypt_to_file("secret-data", &path).unwrap();
        assert_eq!(
            svc.decrypt_from_file(&path).unwrap().unwrap(),
            "secret-data"
        );
    }
}
