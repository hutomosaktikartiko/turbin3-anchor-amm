use anchor_lang::prelude::*;
use constant_product_curve::CurveError;

#[error_code]
pub enum AmmError {
    #[msg("DefaultError")]
    DefaultError,

    // Pool Management Errors
    #[msg("This pool is locked.")]
    PoolLocked,
    #[msg("No liquidity pool.")]
    NoLiquidityPool,
    #[msg("Bump error.")]
    BumpError,

    // Trading Errors
    #[msg("Slippage tolerance exceed.")]
    SlippageExceeded,
    #[msg("Invalid token provided.")]
    InvalidToken,
    #[msg("Offer has expired.")]
    OfferExpired,

    // Math Errors
    #[msg("Mathematical overflow detected.")]
    Overflow,
    #[msg("Mathematical underflow detected.")]
    Underflow,
    #[msg("Invalid amount provided.")]
    InvalidAmount,

    // Liquidity Errors
    #[msg("Actual liquidity is less than minimum required.")]
    LiquidityLessThanMinimum,
    #[msg("Insufficient balance for operation.")]
    InsufficientBalance,
    #[msg("Zero balance not allowed.")]
    ZeroBalance,

    // Configuration Errors
    #[msg("Fee exceeds maximum allowed.")]
    InvalidFee,
    #[msg("Invalid precision value.")]
    InvalidPrecision,

    // Authorization Errors
    #[msg("Unauthorized access attempt")]
    Unauthorized,
    #[msg("No authority set for this pool")]
    NoAuthority,
}

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
