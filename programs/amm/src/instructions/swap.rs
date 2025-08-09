use crate::{constants::*, error::AmmError, state::Config};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct Swap<'info> {
    /// User performing the swap
    #[account(mut)]
    pub user: Signer<'info>,

    /// AMM config account
    #[account(
        seeds = [CONFIG_SEED.as_bytes(), config.seed.to_le_bytes().as_ref()],
        bump = config.config_bump,
        constraint = !config.locked @ AmmError::PoolLocked,
    )]
    pub config: Account<'info, Config>,

    /// First token mint
    #[account(
        constraint = mint_x.key() == config.mint_x @ AmmError::InvalidToken
    )]
    pub mint_x: Account<'info, Mint>,

    /// Second token mint
    #[account(
        constraint = mint_y.key() == config.mint_y @ AmmError::InvalidToken
    )]
    pub mint_y: Account<'info, Mint>,

    /// User's token X account
    #[account(
        mut,
        token::mint = mint_x,
        token::authority = user
    )]
    pub user_x: Account<'info, TokenAccount>,

    /// User's token Y account
    #[account(
        mut,
        token::mint = mint_y,
        token::authority = user,
    )]
    pub user_y: Account<'info, TokenAccount>,

    /// Vault for token X
    #[account(
        mut,
        seeds = [VAULT_X_SEED.as_bytes(), config.seed.to_le_bytes().as_ref()],
        bump,
        token::mint = mint_x,
        token::authority = config
    )]
    pub vault_x: Account<'info, TokenAccount>,

    /// Vault for token Y
    #[account(
        mut,
        seeds = [VAULT_Y_SEED.as_bytes(), config.seed.to_le_bytes().as_ref()],
        bump,
        token::mint = mint_y,
        token::authority = config
    )]
    pub vault_y: Account<'info, TokenAccount>,

    /// SPL tokenprogram
    pub token_program: Program<'info, Token>,
}

impl<'info> Swap<'info> {
    /// Validate swap parameters
    pub fn validate(&self, amount_in: u64, min_out: u64) -> Result<()> {
        // check positive amounts
        require!(amount_in > 0 && min_out > 0, AmmError::InvalidAmount);

        // pool must have liquidity
        require!(
            self.vault_x.amount > 0 && self.vault_y.amount > 0,
            AmmError::ZeroBalance
        );

        Ok(())
    }

    /// Read reserves based on direction
    pub fn get_reserves(&self, is_x_to_y: bool) -> (u64, u64) {
        if is_x_to_y {
            (self.vault_x.amount, self.vault_y.amount)
        } else {
            (self.vault_y.amount, self.vault_x.amount)
        }
    }

    /// Constant product with fee: returns amount_out
    pub fn calculate_amount_out(
        &self,
        amount_in: u64,
        reserve_in: u64,
        reserve_out: u64,
    ) -> Result<u64> {
        // amount_in_with_fee = amount_in * (FEE_BASIS_POINTS - fee)
        let fee_bps = self.config.fee as u128;
        let denom_bps = FEE_BASIS_POINTS as u128;

        let amount_in_u128 = amount_in as u128;
        let reserve_in_u128 = reserve_in as u128;
        let reserve_out_u128 = reserve_out as u128;

        let amount_in_with_fee = amount_in_u128
            .checked_mul(denom_bps.checked_sub(fee_bps).ok_or(AmmError::Underflow)?)
            .ok_or(AmmError::Overflow)?;

        // numerator = amount_in_with_fee * reserve_out
        let numerator = amount_in_with_fee
            .checked_mul(reserve_out_u128)
            .ok_or(AmmError::Overflow)?;

        // denominator = reserve_in * denom_bps + amount_int_with_fee
        let denominator = reserve_in_u128
            .checked_mul(denom_bps)
            .ok_or(AmmError::Overflow)?
            .checked_add(amount_in_with_fee)
            .ok_or(AmmError::Overflow)?;

        let amount_out = numerator
            .checked_div(denominator)
            .ok_or(AmmError::ZeroBalance)? as u64;

        require!(amount_out > 0, AmmError::SlippageExceeded);
        Ok(amount_out)
    }

    /// Transfer tokens from user to vault (token in)
    pub fn transfer_in(&self, is_x_to_y: bool, amount_in: u64) -> Result<()> {
        let (from, to) = if is_x_to_y {
            (
                self.user_x.to_account_info(),
                self.vault_x.to_account_info(),
            )
        } else {
            (
                self.user_y.to_account_info(),
                self.vault_y.to_account_info(),
            )
        };

        let cpi_ctx = CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from,
                to,
                authority: self.user.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, amount_in)
    }

    /// Transfer tokens from vault to user (token out)
    pub fn transfer_out(&self, is_x_to_y: bool, amount_out: u64, config_bump: u8) -> Result<()> {
        let seeds = &[
            CONFIG_SEED.as_bytes(),
            &self.config.seed.to_le_bytes(),
            &[config_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let (from, to) = if is_x_to_y {
            (
                self.vault_y.to_account_info(),
                self.user_y.to_account_info(),
            )
        } else {
            (
                self.vault_x.to_account_info(),
                self.user_x.to_account_info(),
            )
        };

        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            Transfer {
                from,
                to,
                authority: self.config.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(cpi_ctx, amount_out)
    }
}

pub fn swap_handler(
    ctx: Context<Swap>,
    is_x_to_y: bool,
    amount_in: u64,
    min_out: u64,
) -> Result<()> {
    // validate inputs
    ctx.accounts.validate(amount_in, min_out)?;

    let config_bump = ctx.accounts.config.config_bump;

    // read reserves based on direction
    let (reserve_in, reserve_out) = ctx.accounts.get_reserves(is_x_to_y);

    // calculate output amount
    let amount_out = ctx
        .accounts
        .calculate_amount_out(amount_in, reserve_in, reserve_out)?;

    // slippage protection
    require!(amount_out >= min_out, AmmError::SlippageExceeded);

    // execute transfer
    // 1. user -> vault (token in)
    ctx.accounts.transfer_in(is_x_to_y, amount_in)?;

    // 2. vault -> user (token out) using PDA signer
    ctx.accounts
        .transfer_out(is_x_to_y, amount_out, config_bump)?;

    Ok(())
}
