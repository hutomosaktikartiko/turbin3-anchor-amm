use anchor_lang::prelude::*;

use crate::{constants::MAX_FEE_BASIS_POINTS, error::AmmError};

/// AMM Pool Configuration
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Unique identifier for this pool
    pub seed: u64,

    /// Optional authority that can be manage pool settings
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
