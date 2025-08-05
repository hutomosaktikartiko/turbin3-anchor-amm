# Phase 1: Foundation Setup

## 🎯 What You'll Learn

Dalam tutorial ini, Anda akan belajar:

- Setup Anchor project dengan proper dependencies
- Membuat constants dan PDA seeds untuk AMM
- Implementasi comprehensive error handling
- Design state structures untuk pool management
- Testing environment setup

---

## Step 1: Project & Dependencies Setup

### Project Structure

```
anchor-amm/
├── Anchor.toml                 # Anchor configuration
├── Cargo.toml                  # Workspace dependencies
├── package.json                # Node.js dependencies
├── programs/amm/
│   ├── Cargo.toml              # Program dependencies
│   ├── src/
│   │   ├── lib.rs              # Program entry point
│   │   ├── constants.rs        # Constants
│   │   ├── error.rs            # Error types
│   │   ├── state/              # State structures
│   │   │   ├── mod.rs          # Module exports
│   │   │   ├── config.rs       # Config state
│   │   └── instructions/       # Business logic
│   │       ├── mod.rs          # Module exports
│   │       ├── initialize.rs   # Pool initialization
│   │       ├── deposit.rs      # Liquidity provision
│   │       └── swap.rs         # Swap operatation
├── tests/                      # Integration tests
└── migrations/                 # Deployment scripts
```

### 🚀 Tutorial Steps

**Step 1.1: Initialize Project & Add Dependencies**

Kita akan membangun AMM dari scratch untuk pembelajaran yang mendalam.

**Initialize Anchor Project:**

```bash
# Create new Anchor project
anchor init anchor-amm --template multiple
cd anchor-amm

# Verify project structure
ls -la programs/amm/src/
```

**Add Rust Dependencies:**

```bash
# Navigate to program directory
cd programs/amm

# Add core Anchor dependencies
cargo add anchor-lang@0.30.0
cargo add anchor-spl@0.30.0

# Add AMM mathematical operations
cargo add constant-product-curve@2.2.0

# Optional: Add precision math utilities
cargo add uint@0.9.5
```

**Penjelasan Dependencies:**

- **anchor-lang**: Core Anchor framework untuk program development

  - Macros: `#[program]`, `#[account]`, `#[derive(Accounts)]`
  - Error handling: `require!()`, custom errors
  - Account management: PDA derivation, account initialization

- **anchor-spl**: SPL token integration untuk Anchor

  - Token operations: transfer, mint, burn
  - Associated token accounts (ATA) management
  - Cross-program invocation helpers untuk SPL Token Program

- **constant-product-curve**: AMM mathematical operations

  - Swap calculations menggunakan x \* y = k formula
  - Fee calculations dan slippage protection
  - Safe math operations untuk prevent overflow

- **uint** (optional): Large integer operations
  - Handle large numbers dengan precision
  - Safe arithmetic operations
  - Useful untuk complex mathematical calculations

**Add Node.js Testing Dependencies:**

```bash
# Return to project root
cd ../../

# Add testing dependencies
npm install @coral-xyz/anchor@^0.30.0
npm install @solana/web3.js@^1.91.1
npm install @solana/spl-token@^0.4.1

# Add development dependencies
npm install --save-dev @types/bn.js@^5.1.5
npm install --save-dev @types/chai@^4.3.0
npm install --save-dev chai@^4.3.0
npm install --save-dev mocha@^10.2.0
npm install --save-dev typescript@^5.0.0
```

**Penjelasan Testing Dependencies:**

- **@coral-xyz/anchor**: Client-side Anchor untuk interact dengan program
- **@solana/web3.js**: Core Solana JavaScript SDK
- **@solana/spl-token**: SPL token utilities untuk testing
- **Testing tools**: Mocha, Chai untuk unit testing

**Configure Anchor Settings:**

Edit `Anchor.toml`:

```toml
[programs.localnet]
amm = "GcVc8WR7EiPBuDiHGWFCRB8Tpjcqr7d4Jur3uLs1Fs1u"

[provider]
cluster = "Localnet"
wallet = "~/.config/solana/id.json"

[test]
startup_wait = 5000
shutdown_wait = 2000
```

**Verify Development Environment:**

```bash
# Check installed tools
solana --version
anchor --version
node --version
rustc --version

# Test initial build
anchor build

# Start local validator (new terminal)
solana-test-validator

# Verify connection (another terminal)
solana cluster-date
```

---

## Step 2: Constants & PDA Seeds

### 🔧 Implementasi Constants

Mari kita buat constants yang proper untuk AMM system.

**Step 2.1: Create Constants File**

Buat file `programs/amm/src/constants.rs`:

```rust
use anchor_lang::prelude::*;

// PDA Seeds - for deterministic address generation
#[constant]
pub const CONFIG_SEED: &str = "config";

#[constant]
pub const LP_MINT_SEED: &str = "lp_mint";

#[constant]
pub const VAULT_X_SEED: &str = "vault_x";

#[constant]
pub const VAULT_Y_SEED: &str = "vault_y";

// Math Constants - for calculations and validations
#[constant]
pub const FEE_BASIS_POINTS: u16 = 10000; // 100% = 10000 bps

#[constant]
pub const MINIMUM_LIQUIDITY: u64 = 1000; // Min LP tokens to prevent division by zero

#[constant]
pub const MAX_FEE_BASIS_POINTS: u16 = 500; // 5% maximum fee
```

**Penjelasan Setiap Constant:**

- **PDA Seeds**: Digunakan untuk generate addresses yang deterministic

  - `CONFIG_SEED`: Untuk config account yang menyimpan pool data
  - `LP_MINT_SEED`: Untuk LP token mint account
  - `VAULT_X_SEED` & `VAULT_Y_SEED`: Untuk token storage accounts

- **Math Constants**: Untuk calculations dan validations
  - `FEE_BASIS_POINTS`: Konversi percentage (1% = 100 bps)
  - `MINIMUM_LIQUIDITY`: Prevent division by zero dalam formula
  - `MAX_FEE_BASIS_POINTS`: Maximum 5% fee untuk protect users

**Step 2.2: PDA Derivation Pattern**

Dengan constants ini, kita akan derive PDAs dengan pattern:

```rust
// Config PDA: [b"config", seed.to_le_bytes()]
// LP Mint PDA: [b"lp_mint", seed.to_le_bytes()]
// Vault X PDA: [b"vault_x", seed.to_le_bytes()]
// Vault Y PDA: [b"vault_y", seed.to_le_bytes()]
```

**Mengapa Approach Ini Bagus:**

- **Deterministic**: Setiap pool dengan seed yang sama akan punya addresses yang sama
- **Secure**: Hanya program yang bisa control accounts ini
- **Predictable**: Client bisa calculate addresses tanpa RPC call
- **Efficient**: Constants di-compile inline, hemat compute units

### 💡 Mengapa Constants Penting?

- **Consistency**: Semua PDA derivation menggunakan seeds yang sama
- **Security**: Hard-coded values mencegah manipulation
- **Maintenance**: Mudah update fee structures
- **Gas Optimization**: Constants di-compile inline

---

## Step 3: Error Handling

### 🔧 Implementasi Error Types

Error handling yang baik adalah kunci untuk AMM yang robust.

**Step 3.1: Create Error File**

Buat file `programs/amm/src/error.rs`:

```rust
use anchor_lang::prelude::*;
use constant_product_curve::CurveError;

#[error_code]
pub enum AmmError {
    #[msg("Default error")]
    DefaultError,

    // Pool Management Errors
    #[msg("This pool is locked")]
    PoolLocked,
    #[msg("No liquidity pool found")]
    NoLiquidityPool,
    #[msg("Bump error")]
    BumpError,

    // Trading Errors
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Invalid token provided")]
    InvalidToken,
    #[msg("Offer has expired")]
    OfferExpired,

    // Math Errors
    #[msg("Mathematical overflow detected")]
    Overflow,
    #[msg("Mathematical underflow detected")]
    Underflow,
    #[msg("Invalid amount provided")]
    InvalidAmount,

    // Liquidity Errors
    #[msg("Actual liquidity is less than minimum required")]
    LiquidityLessThanMinimum,
    #[msg("Insufficient balance for operation")]
    InsufficientBalance,
    #[msg("Zero balance not allowed")]
    ZeroBalance,

    // Configuration Errors
    #[msg("Fee exceeds maximum allowed")]
    InvalidFee,
    #[msg("Invalid precision value")]
    InvalidPrecision,
}

// Convert CurveError to AmmError
impl From<CurveError> for AmmError {
    fn from(error: CurveError) -> AmmError {
        match error {
            CurveError::InvalidPrecision => AmmError::InvalidPrecision,
            CurveError::Overflow => AmmError::Overflow,
            CurveError::Underflow => AmmError::Underflow,
            CurveError::InvalidFeeAmount => AmmError::InvalidFee,
            CurveError::InsufficientBalance => AmmError::InsufficientBalance,
            CurveError::ZeroBalance => AmmError::ZeroBalance,
            CurveError::SlippageLimitExceeded => AmmError::SlippageExceeded,
        }
    }
}
```

**Penjelasan Error Categories:**

- **Pool Management**: Errors terkait pool state dan configuration
- **Trading**: Errors yang terjadi saat swap operations
- **Math**: Mathematical operation errors (overflow/underflow)
- **Liquidity**: Errors terkait liquidity management
- **Configuration**: Validation errors untuk parameters

**Step 3.2: Error Usage Pattern**

Dalam instructions, gunakan `require!()` macro:

```rust
// Example error usage in instructions
require!(fee <= MAX_FEE_BASIS_POINTS, AmmError::InvalidFee);
require!(!config.locked, AmmError::PoolLocked);
require!(amount > 0, AmmError::InvalidAmount);
```

---

## Step 4: State Structures

### 🔧 Implementasi Config State

State management adalah core dari AMM system.

**Step 4.1: Create State File**

Buat file `programs/amm/src/state/config.rs`:

```rust
use anchor_lang::prelude::*;

/// AMM Pool Configuration
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Unique identifier for this pool
    pub seed: u64,

    /// Optional authority that can manage pool settings
    pub authority: Option<Pubkey>,

    /// First token mint address
    pub mint_x: Pubkey,

    /// Second token mint address
    pub mint_y: Pubkey,

    /// Trading fee in basis points (100 = 1%)
    pub fee: u16,

    /// Pool lock status (true = trading disabled)
    pub locked: bool,

    /// PDA bump for config account
    pub config_bump: u8,

    /// PDA bump for LP mint account
    pub lp_bump: u8,
}

impl Config {
    /// Check if pool is currently locked
    pub fn is_locked(&self) -> bool {
        self.locked
    }

    /// Validate fee is within acceptable range
    pub fn validate_fee(&self) -> Result<()> {
        require!(self.fee <= MAX_FEE_BASIS_POINTS, AmmError::InvalidFee);
        Ok(())
    }

    /// Check if given authority can modify pool settings
    pub fn can_modify(&self, authority: &Pubkey) -> Result<()> {
        match self.authority {
            Some(auth) => require!(auth == *authority, AmmError::Unauthorized),
            None => return Err(AmmError::NoAuthority.into()),
        }
        Ok(())
    }

    /// Calculate pool token ratio for liquidity calculations
    pub fn token_ratio(&self, reserve_x: u64, reserve_y: u64) -> Result<f64> {
        require!(reserve_x > 0 && reserve_y > 0, AmmError::ZeroBalance);
        Ok(reserve_x as f64 / reserve_y as f64)
    }
}
```

**Penjelasan Design Choices:**

- **#[account]**: Menandai struct sebagai Solana account yang bisa di-serialize
- **#[derive(InitSpace)]**: Auto-calculate space requirements untuk rent
- **Optional Authority**: Flexibility untuk managed vs permissionless pools
- **PDA Bumps**: Store bumps untuk efficient future derivations
- **Helper Methods**: Business logic untuk validations dan calculations

---

## 🎯 Tutorial Complete!

Congratulations! Anda telah menyelesaikan Phase 1 foundation setup. Sekarang Anda memiliki:

✅ **Solid Foundation:**

- Complete dependencies setup
- Well-structured constants dengan PDA seeds
- Comprehensive error handling system
- Robust state management dengan helper methods

---

## 🚀 Next Steps

**Phase 2**: Pool Initialization

- Implement initialize instruction
- Create PDA accounts (config, LP mint, vaults)
- Setup cross-program invocations
- Add validation logic

**Testing Your Foundation:**

```bash
# Build to verify no compilation errors
anchor build

# Test your environment
solana-test-validator
```

---

## 📚 Daftar Pustaka & Referensi

### 🔬 AMM Theory & Mathematics

**Constant Product Formula (x \* y = k)**

- **Konsep**: Formula fundamental untuk AMM yang menjaga konstan product dari dua token reserves
- **Aplikasi**: Menentukan harga swap berdasarkan ratio token dalam pool
- **Referensi**: [Uniswap V2 Whitepaper](https://uniswap.org/whitepaper.pdf)

**Liquidity Provision**

- **Konsep**: Users menyediakan kedua token ke pool dan mendapat LP tokens sebagai receipt
- **Rewards**: LP earns dari trading fees yang dibagi proportional
- **Referensi**: [Liquidity Mining Explained](https://academy.binance.com/en/articles/what-is-yield-farming-in-decentralized-finance-defi)

### 🏗️ Solana & Anchor Architecture

**Program Derived Addresses (PDA)**

- **Konsep**: Deterministik address generation tanpa private key
- **Kegunaan**: Account ownership oleh program, bukan user
- **Pattern**: `find_program_address([seeds], program_id)`
- **Referensi**: [Solana PDA Guide](https://solana.com/id/docs/core/pda)

**Cross-Program Invocation (CPI)**

- **Definisi**: Program memanggil instruction dari program lain
- **Implementasi**: `invoke()` dan `invoke_signed()` untuk PDA
- **Use Case**: AMM program memanggil SPL Token program
- **Referensi**: [Solana CPI Guide](https://solana.com/id/docs/core/cpi)

**Account Model & Rent**

- **Rent-Exempt**: Account harus maintain minimum balance
- **Account Size**: Pengaruh terhadap storage cost
- **Optimization**: Minimize account size untuk efisiensi
- **Referensi**: [Solana Account Model](https://solana.com/id/docs/core/accounts)

### 🔐 Security & Best Practices

**Error Handling Patterns**

- **Custom Errors**: Create specific error types untuk setiap scenario
- **Validation**: Use `require!()` macro untuk input validation
- **User Experience**: Clear error messages untuk debugging

**State Management**

- **InitSpace**: Auto-calculate account size requirements
- **Memory Layout**: Efficient field ordering untuk minimize rent
- **Helper Methods**: Business logic encapsulation dalam impl blocks

### 📖 Learning Resources

**Official Documentation**

- [Anchor Book](https://www.anchor-lang.com/docs) - Framework documentation
- [Solana Docs](https://solana.com/id/docs) - Platform documentation
- [SPL Token Guide](https://www.solana-program.com/docs/token) - Token program reference

**AMM Implementations**

- [Raydium](https://github.com/raydium-io/raydium-contract) - Popular Solana AMM
- [Orca](https://github.com/orca-so/whirlpool) - Concentrated liquidity AMM
- [Uniswap V2](https://github.com/Uniswap/v2-core) - Original AMM reference

**Development Tools**

- [Solana Test Validator](https://docs.anza.xyz/cli/examples/test-validator) - Local development
- [Anchor Test Framework](https://www.anchor-lang.com/docs/testing) - Unit testing
- [Solana Explorer](https://explorer.solana.com/) - Transaction inspection

---

_Next: [Phase 2 - Pool Initialization](./learning-02-initialize.md)_ 🚀
