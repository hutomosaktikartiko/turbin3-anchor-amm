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
pub const FEE_BASIS_POINTS: i16 = 10000; // 100%

#[constant]
pub const MINIMUM_LIQUIDITY: u64 = 1000; // Min LP tokens to prevent division by zero

#[constant]
pub const MAX_FEE_BASIS_POINTS: u16 = 500; // 5%
