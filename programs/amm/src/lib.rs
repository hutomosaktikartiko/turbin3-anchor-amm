#![allow(unexpected_cfgs)]
#![allow(deprecated)]

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("GcVc8WR7EiPBuDiHGWFCRB8Tpjcqr7d4Jur3uLs1Fs1u");

#[program]
pub mod amm {
    use super::*;

    /// Initialize a new AMM pool
    pub fn initialize(ctx: Context<Initialize>, seed: u64, fee: u16) -> Result<()> {
        instructions::initialize::initialize_handler(ctx, seed, fee)
    }

    /// Deposit liquidity to the pool
    pub fn deposit(ctx: Context<Deposit>, amount_x: u64, amount_y: u64, min_lp: u64) -> Result<()> {
        instructions::deposit::deposit_handler(ctx, amount_x, amount_y, min_lp)
    }

    /// Withdraw liquidity from the pool
    pub fn withdraw(ctx: Context<Withdraw>, lp_amount: u64, min_x: u64, min_y: u64) -> Result<()> {
        instructions::withdraw::withdraw_handler(ctx, lp_amount, min_x, min_y)
    }

    /// Swap tokens using constant product curve
    pub fn swap(ctx: Context<Swap>, is_x_to_y: bool, amount_in: u64, min_out: u64) -> Result<()> {
        instructions::swap::swap_handler(ctx, is_x_to_y, amount_in, min_out)
    }
}
