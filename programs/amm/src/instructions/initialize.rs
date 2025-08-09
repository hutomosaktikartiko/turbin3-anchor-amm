use crate::{constants::*, error::AmmError, state::Config};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

#[derive(Accounts)]
#[instruction(seed: u64, fee: u16)]
pub struct Initialize<'info> {
    /// Authority that can initialize the pool
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The AMM config account to be created
    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED.as_bytes(), seed.to_le_bytes().as_ref()],
        bump
    )]
    pub config: Account<'info, Config>,

    /// First token mint for the pool
    pub mint_x: Account<'info, Mint>,

    /// Second token mint for the pool
    pub mint_y: Account<'info, Mint>,

    /// LP token mint to be created
    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = config,
        seeds = [LP_MINT_SEED.as_bytes(), seed.to_le_bytes().as_ref()],
        bump
    )]
    pub lp_mint: Account<'info, Mint>,

    /// Vault for storing token X
    #[account(
        init,
        payer = authority,
        token::mint = mint_x,
        token::authority = config,
        seeds = [VAULT_X_SEED.as_bytes(), seed.to_le_bytes().as_ref()],
        bump
    )]
    pub vault_x: Account<'info, TokenAccount>,

    /// Vault for storing token Y
    #[account(
        init,
        payer = authority,
        token::mint = mint_y,
        token::authority = config,
        seeds = [VAULT_Y_SEED.as_bytes(), seed.to_le_bytes().as_ref()],
        bump
    )]
    pub vault_y: Account<'info, anchor_spl::token::TokenAccount>,

    /// SPL token program
    pub token_program: Program<'info, Token>,

    /// Associated token program
    pub associated_token_program: Program<'info, AssociatedToken>,

    /// System program
    pub system_program: Program<'info, System>,
}

impl<'info> Initialize<'info> {
    /// Validate the initialize parameters
    pub fn validate(&self, fee: u16) -> Result<()> {
        // validate fee is within acceptable range
        require!(
            fee <= crate::constants::MAX_FEE_BASIS_POINTS,
            AmmError::InvalidFee
        );

        // ensure mint X and Y are different
        require!(
            self.mint_x.key() != self.mint_y.key(),
            AmmError::InvalidToken
        );

        // validate mint decimals (for consistency)
        require!(self.mint_x.decimals <= 9, AmmError::InvalidPrecision);
        require!(self.mint_y.decimals <= 9, AmmError::InvalidPrecision);

        Ok(())
    }
}

/// Handler function for initializing a new AMM pool
pub fn initialize_handler(ctx: Context<Initialize>, seed: u64, fee: u16) -> Result<()> {
    // validate inputs
    ctx.accounts.validate(fee)?;

    // get PDA bumps
    let config_bump = ctx.bumps.config;
    let lp_bump = ctx.bumps.lp_mint;

    // initialize config account
    let config = &mut ctx.accounts.config;
    config.seed = seed;
    config.authority = Some(ctx.accounts.authority.key());
    config.mint_x = ctx.accounts.mint_x.key();
    config.mint_y = ctx.accounts.mint_y.key();
    config.fee = fee;
    config.locked = false; // pool starts unlocked
    config.config_bump = config_bump;
    config.lp_bump = lp_bump;

    Ok(())
}
