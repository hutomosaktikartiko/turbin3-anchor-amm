use crate::{constants::*, error::AmmError, state::Config};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, MintTo, Token, TokenAccount, Transfer},
};

#[derive(Accounts)]
pub struct Deposit<'info> {
    /// User depositing liquidity
    #[account(mut)]
    pub user: Signer<'info>,

    /// AMM config account
    #[account(
        seeds = [CONFIG_SEED.as_bytes(), config.seed.to_le_bytes().as_ref()],
        bump = config.config_bump,
        constraint = !config.locked @ AmmError::PoolLocked,
    )]
    pub config: Account<'info, Config>,

    /// Firts token mint
    #[account(
        constraint = mint_x.key() == config.mint_x @ AmmError::InvalidToken
    )]
    pub mint_x: Account<'info, Mint>,

    /// Second token mint
    #[account(
        constraint = mint_y.key() == config.mint_y @ AmmError::InvalidToken
    )]
    pub mint_y: Account<'info, Mint>,

    /// LP token mint
    #[account(
        mut,
        seeds = [LP_MINT_SEED.as_bytes(), config.seed.to_le_bytes().as_ref()],
        bump = config.lp_bump,
    )]
    pub lp_mint: Account<'info, Mint>,

    /// User's token X account
    #[account(
        mut,
        associated_token::mint = mint_x,
        associated_token::authority = user
    )]
    pub user_x: Account<'info, TokenAccount>,

    /// User's token Y account
    #[account(
        mut,
        associated_token::mint = mint_y,
        associated_token::authority = user
    )]
    pub user_y: Account<'info, TokenAccount>,

    /// User's LP token account
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = lp_mint,
        associated_token::authority = user,
    )]
    pub user_lp: Account<'info, TokenAccount>,

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

    /// SPL token program
    pub token_program: Program<'info, Token>,

    /// Associated token program
    pub associated_token_program: Program<'info, AssociatedToken>,

    /// System program
    pub system_program: Program<'info, System>,
}

impl<'info> Deposit<'info> {
    /// Validate deposit parameters
    pub fn validate(&self, amount_x: u64, amount_y: u64, min_lp: u64) -> Result<()> {
        // check amounts are positive
        require!(amount_x > 0 && amount_y > 0, AmmError::InvalidAmount);
        require!(min_lp > 0, AmmError::LiquidityLessThanMinimum);

        // check user has sufficient balance
        require!(
            self.user_x.amount >= amount_x,
            AmmError::InsufficientBalance
        );
        require!(
            self.user_y.amount >= amount_y,
            AmmError::InsufficientBalance
        );

        Ok(())
    }

    /// Check if this is the first deposit (empty pool)
    pub fn is_first_deposit(&self) -> bool {
        self.vault_x.amount == 0 && self.vault_y.amount == 0
    }

    /// Calculate LP tokens for first deposit
    pub fn calculate_first_deposit_lp(&self, amount_x: u64, amount_y: u64) -> Result<u64> {
        // For first deposit, LP = sqrt(x * y) - MINIMUM_LIQUIDITY
        let product = (amount_x as u128)
            .checked_mul(amount_y as u128)
            .ok_or(AmmError::Overflow)?;

        let lp_amount = (product as f64).sqrt() as u64;

        require!(
            lp_amount > MINIMUM_LIQUIDITY,
            AmmError::LiquidityLessThanMinimum
        );

        Ok(lp_amount
            .checked_sub(MINIMUM_LIQUIDITY)
            .ok_or(AmmError::Underflow)?)
    }

    /// Calculate LP tokens for subsequent deposits
    pub fn calculate_subsequent_deposit_lp(&self, amount_x: u64, amount_y: u64) -> Result<u64> {
        let reserve_x = self.vault_x.amount;
        let reserve_y = self.vault_y.amount;
        let total_supply = self.lp_mint.supply;

        require!(reserve_x > 0 && reserve_y > 0, AmmError::ZeroBalance);
        require!(total_supply > 0, AmmError::ZeroBalance);

        // calculate LP based on the minimum ratio to maintain pool balance
        let lp_from_x = (amount_x as u128)
            .checked_mul(total_supply as u128)
            .ok_or(AmmError::Overflow)?
            .checked_div(reserve_x as u128)
            .ok_or(AmmError::ZeroBalance)?;

        let lp_from_y = (amount_y as u128)
            .checked_mul(total_supply as u128)
            .ok_or(AmmError::Overflow)?
            .checked_div(reserve_y as u128)
            .ok_or(AmmError::ZeroBalance)?;

        // take the minimum to maintain pool ratio
        let lp_amount = std::cmp::min(lp_from_x, lp_from_y) as u64;

        require!(lp_amount > 0, AmmError::LiquidityLessThanMinimum);

        Ok(lp_amount)
    }

    /// Transfer tokens from user to vaults
    pub fn transfer_to_vaults(&self, amount_x: u64, amount_y: u64) -> Result<()> {
        // transfer token X to vault
        let transfer_x_ctx = CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.user_x.to_account_info(),
                to: self.vault_x.to_account_info(),
                authority: self.user.to_account_info(),
            },
        );
        token::transfer(transfer_x_ctx, amount_x)?;

        // transfer token Y to vault
        let transfer_y_ctx = CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.user_y.to_account_info(),
                to: self.vault_y.to_account_info(),
                authority: self.user.to_account_info(),
            },
        );
        token::transfer(transfer_y_ctx, amount_y)?;

        Ok(())
    }

    /// Mint LP tokens to user
    pub fn mint_lp_tokens(&self, lp_amount: u64, config_bump: u8) -> Result<()> {
        let seeds = &[
            CONFIG_SEED.as_bytes(),
            &self.config.seed.to_le_bytes(),
            &[config_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let mint_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            MintTo {
                mint: self.lp_mint.to_account_info(),
                to: self.user_lp.to_account_info(),
                authority: self.config.to_account_info(),
            },
            signer_seeds,
        );

        token::mint_to(mint_ctx, lp_amount)?;

        Ok(())
    }
}

/// Handler function for Depositing liquidity pool
pub fn deposit_handler(
    ctx: Context<Deposit>,
    amount_x: u64,
    amount_y: u64,
    min_lp: u64,
) -> Result<()> {
    // validate inpurts
    ctx.accounts.validate(amount_x, amount_y, min_lp)?;

    let config_bump = ctx.accounts.config.config_bump;

    // calculate LP tokens based on deposit type
    let lp_amount = if ctx.accounts.is_first_deposit() {
        msg!("First deposit detected");
        ctx.accounts
            .calculate_first_deposit_lp(amount_x, amount_y)?
    } else {
        msg!("Subsequent deposit detected");
        ctx.accounts
            .calculate_subsequent_deposit_lp(amount_x, amount_y)?
    };

    // check slippage protection
    require!(lp_amount >= min_lp, AmmError::SlippageExceeded);

    // transfer tokens to vaults
    ctx.accounts.transfer_to_vaults(amount_x, amount_y)?;

    // mint LP tokens to user
    ctx.accounts.mint_lp_tokens(lp_amount, config_bump)?;

    Ok(())
}
