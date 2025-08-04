# AMM dengan Solana Anchor

## 🎯 Tentang Project AMM

**Automated Market Maker (AMM)** adalah smart contract yang memungkinkan pertukaran token secara otomatis menggunakan formula matematika, tanpa memerlukan order book tradisional.

**Key Concepts:**

- **Constant Product Formula**: x \* y = k
- **Liquidity Pool**: Kumpulan dua token yang dipasangkan
- **LP Tokens**: Token yang diberikan kepada liquidity providers
- **Slippage**: Perubahan harga karena ukuran transaksi

---

## 🏗️ System Architecture

### High-Level System Overview

```mermaid
graph TB
    subgraph "Users"
        LP[Liquidity Provider]
        TR[Trader]
    end

    subgraph "AMM Program"
        CONFIG[Config Account]
        LPMINT[LP Mint]
        VAULTX[Vault X]
        VAULTY[Vault Y]
    end

    subgraph "Instructions"
        INIT[Initialize Pool]
        DEP[Deposit Liquidity]
        WITH[Withdraw Liquidity]
        SWAP[Swap Tokens]
    end

    LP -->|Provide Liquidity| DEP
    LP -->|Remove Liquidity| WITH
    TR -->|Trade Tokens| SWAP

    INIT --> CONFIG
    INIT --> LPMINT
    INIT --> VAULTX
    INIT --> VAULTY

    DEP -->|Updates| CONFIG
    DEP -->|Mints| LPMINT
    DEP -->|Transfers to| VAULTX
    DEP -->|Transfers to| VAULTY

    SWAP -->|Updates| CONFIG
    SWAP -->|Transfers from/to| VAULTX
    SWAP -->|Transfers from/to| VAULTY
```

**📝 Penjelasan:**

- **Users**: Dua tipe pengguna utama - Liquidity Provider (menyediakan token) dan Trader (menukar token)
- **AMM Program**: Terdiri dari 4 account utama yang menyimpan state dan token pool
- **Instructions**: 4 operasi inti yang dapat dilakukan users untuk berinteraksi dengan pool
- **Flow**: Setiap instruction berinteraksi dengan account-account yang relevan untuk melakukan operasinya

### User Interaction Flow

```mermaid
sequenceDiagram
    participant U as User
    participant AMM as AMM Program
    participant SPL as SPL Token Program

    Note over U,SPL: Pool Initialization
    U->>AMM: Initialize Pool
    AMM->>SPL: Create LP Mint
    AMM->>SPL: Create Vault Accounts
    AMM-->>U: Pool Ready

    Note over U,SPL: Liquidity Provision
    U->>AMM: Deposit (amount_x, amount_y)
    AMM->>SPL: Transfer Token X to Vault
    AMM->>SPL: Transfer Token Y to Vault
    AMM->>SPL: Mint LP Tokens to User
    AMM-->>U: LP Tokens Received

    Note over U,SPL: Token Swapping
    U->>AMM: Swap (token_in, amount_in)
    AMM->>AMM: Calculate Output (x*y=k)
    AMM->>SPL: Transfer Token In to Vault
    AMM->>SPL: Transfer Token Out to User
    AMM-->>U: Swap Complete
```

**📝 Penjelasan:**

- **Pool Initialization**: User memanggil initialize, AMM Program membuat LP mint dan vault accounts via SPL Token Program
- **Liquidity Provision**: User deposit token X & Y, AMM transfer tokens ke vault dan mint LP tokens sebagai bukti kepemilikan
- **Token Swapping**: User swap token, AMM hitung output dengan formula x\*y=k, lalu execute transfer melalui SPL Program
- **Cross-Program Calls**: AMM Program berinteraksi dengan SPL Token Program untuk semua operasi token

### Account Relationships

```mermaid
erDiagram
    CONFIG ||--|| LP_MINT : "controls"
    CONFIG ||--|| VAULT_X : "owns"
    CONFIG ||--|| VAULT_Y : "owns"
    CONFIG {
        u64 seed
        Pubkey authority
        Pubkey mint_x
        Pubkey mint_y
        u16 fee
        bool locked
        u8 config_bump
        u8 lp_bump
    }

    USER_X_ATA ||--o{ VAULT_X : "transfers to/from"
    USER_Y_ATA ||--o{ VAULT_Y : "transfers to/from"
    USER_LP_ATA ||--o{ LP_MINT : "mints/burns"

    VAULT_X {
        Pubkey mint
        u64 amount
    }

    VAULT_Y {
        Pubkey mint
        u64 amount
    }

    LP_MINT {
        Pubkey mint_authority
        u64 supply
    }
```

**📝 Penjelasan:**

- **CONFIG**: Account utama yang menyimpan konfigurasi pool dan controls LP_MINT serta owns kedua vault
- **VAULT_X & VAULT_Y**: Token accounts yang menyimpan actual tokens (X dan Y) yang di-pool oleh users
- **LP_MINT**: Mint account untuk LP tokens yang di-mint kepada liquidity providers sebagai proof of ownership
- **USER ATAs**: Associated Token Accounts milik users untuk berinteraksi dengan vaults dan LP mint
- **Relationships**: One-to-one controls/ownership, many-to-many user interactions

---

## 📚 Learning Path

### 📍 Phase 1: Foundation Setup

**File Detail**: [`learning-01-foundation.md`](./learning-01-foundation.md)

- [ ] **1.1** Setup project structure & dependencies
- [ ] **1.2** Define constants dan seeds
- [ ] **1.3** Create comprehensive error types
- [ ] **1.4** Design state structures

### 📍 Phase 2: Pool Initialization

**File Detail**: `learning-02-initialize.md`

- [ ] **2.1** Create PDA untuk config account
- [ ] **2.2** Setup LP mint dengan proper authority
- [ ] **2.3** Initialize vault accounts
- [ ] **2.4** Implement validation & access control

### 📍 Phase 3: Liquidity Management

**File Detail**: `learning-03-liquidity.md`

- [ ] **3.1** Implement deposit liquidity
- [ ] **3.2** Calculate LP token amounts
- [ ] **3.3** Handle first deposit vs subsequent
- [ ] **3.4** Implement withdraw liquidity

### 📍 Phase 4: Token Swapping

**File Detail**: `learning-04-swap.md`

- [ ] **4.1** Implement constant product formula
- [ ] **4.2** Calculate swap amounts with fees
- [ ] **4.3** Add slippage protection
- [ ] **4.4** Handle edge cases

### 📍 Phase 5: Testing & Deployment

**File Detail**: `learning-05-testing.md`

- [ ] **5.1** Write comprehensive unit tests
- [ ] **5.2** Integration testing dengan multiple users
- [ ] **5.3** Deploy ke devnet & mainnet
- [ ] **5.4** Security considerations

---

## 📚 Daftar Pustaka & Referensi Teori

### 🔬 AMM Theory & Mathematics

**Constant Product Formula (x \* y = k)**

- **Konsep**: Formula fundamental untuk AMM yang menjaga konstan product dari dua token reserves
- **Aplikasi**: Menentukan harga swap berdasarkan ratio token dalam pool
- **Referensi**: [Uniswap V2 Whitepaper](https://uniswap.org/whitepaper.pdf)
- **Formula Detail**:
  ```
  x * y = k (sebelum dan sesudah swap)
  Price = dy/dx = x/y
  ```

**Slippage & Price Impact**

- **Definisi**: Perubahan harga karena ukuran trade yang mempengaruhi pool balance
- **Rumus**: `Price Impact = (Amount Out Expected - Amount Out Actual) / Amount Out Expected`
- **Mitigasi**: Slippage tolerance dan minimum output amount
- **Referensi**: [Slippage in AMMs](https://docs.uniswap.org/concepts/protocol/swaps#slippage)

**Impermanent Loss**

- **Konsep**: Kerugian temporer liquidity providers karena perubahan harga relatif token
- **Perhitungan**: Perbandingan holding vs providing liquidity
- **Referensi**: [Impermanent Loss Explained](https://academy.binance.com/en/articles/impermanent-loss-explained)

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

**Integer Overflow/Underflow**

- **Risiko**: Operasi matematika yang melampaui batas data type
- **Mitigasi**: Checked arithmetic operations
- **Implementation**: `checked_add()`, `checked_mul()` dalam Rust
- **Referensi**: [Solana Security Best Practices](https://github.com/coral-xyz/sealevel-attacks)

**Reentrancy Protection**

- **Konsep**: Mencegah recursive calls yang berbahaya
- **Pattern**: State checks before external calls
- **Implementation**: Lock mechanisms dan proper state management

**Access Control**

- **Authority Patterns**: Optional authority, multi-sig, timelock
- **Validation**: Proper signer verification
- **Implementation**: `require!()` macros untuk kondisi checks

### 📖 Learning Resources

**Official Documentation**

- [Anchor Book](https://www.anchor-lang.com/docs) - Framework documentation
- [Solana Docs](https://solana.com/id/docs) - Platform documentation
- [SPL Token Guide](https://www.solana-program.com/docs/token) - Token program reference

**AMM Implementations**

- [Raydium](https://github.com/raydium-io/raydium-contract) - Popular Solana AMM
- [Orca](https://github.com/orca-so/whirlpool) - Concentrated liquidity AMM
- [Uniswap V2](https://github.com/Uniswap/v2-core) - Original AMM reference

**Mathematics & DeFi Theory**

- [DeFi MOOC](https://defi-learning.org/) - Comprehensive DeFi course
- [Paradigm Research](https://www.paradigm.xyz/writing) - Advanced DeFi concepts
- [AMM Evolution](https://research.paradigm.xyz/amm-price-impact) - Price impact research

### 🛠️ Development Tools

**Testing & Debugging**

- [Solana Test Validator](https://docs.anza.xyz/cli/examples/test-validator) - Local development
- [Anchor Test Framework](https://www.anchor-lang.com/docs/testing) - Unit testing
- [Solana Explorer](https://explorer.solana.com/) - Transaction inspection

**Mathematical Libraries**

- `constant-product-curve` - AMM mathematical operations
- `uint` - Large integer operations
- `decimal` - Precise decimal calculations

---

_Happy Learning! 🚀_
