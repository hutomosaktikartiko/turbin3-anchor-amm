import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createMint,
    mintTo,
    getOrCreateAssociatedTokenAccount,
    getAccount
} from "@solana/spl-token";
import { Amm } from "../target/types/amm";
import { expect } from "chai"; 

describe("AMM Token Swapping", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.Amm as Program<Amm>;

    let mintX: PublicKey;
    let mintY: PublicKey;
    let authority: Keypair;
    let trader: Keypair;
    let configPda: PublicKey;
    let lpMintPda: PublicKey;
    let vaultXPda: PublicKey;
    let vaultYPda: PublicKey;
    let seed: anchor.BN;
    const fee = 30; // 0.3%

    beforeEach(async () => {
        authority = Keypair.generate();
        trader = Keypair.generate();
        
        // Generate random seed for each test to avoid account conflicts
        seed = new anchor.BN(Math.floor(Math.random() * 1000000));

        // airdrop SOL
        await Promise.all([
            provider.connection.confirmTransaction(
                await provider.connection.requestAirdrop(
                    authority.publicKey,
                    2_000_000_000
                )
            ),
            provider.connection.confirmTransaction(
                await provider.connection.requestAirdrop(
                    trader.publicKey,
                    2_000_000_000
                )
            )
        ]);

        // create test token mints
        mintX = await createMint(
            provider.connection,
            authority,
            authority.publicKey,
            null,
            6,
        );

        mintY = await createMint(
            provider.connection,
            authority,
            authority.publicKey,
            null,
            6,
        );

        // derive PDA addresses
        [configPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("config"), seed.toArrayLike(Buffer, "le", 8)],
            program.programId,
        );

        [lpMintPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("lp_mint"), seed.toArrayLike(Buffer, "le", 8)],
            program.programId,
        );

        [vaultXPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault_x"), seed.toArrayLike(Buffer, "le", 8)],
            program.programId,
        );

        [vaultYPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault_y"), seed.toArrayLike(Buffer, "le", 8)],
            program.programId,
        );

        // Initialize the pool
        await program.methods
            .initialize(seed, fee)
            .accounts({
                authority: authority.publicKey,
                config: configPda,
                mintX: mintX,
                mintY: mintY,
                lpMint: lpMintPda,
                vaultX: vaultXPda,
                vaultY: vaultYPda,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .signers([authority])
            .rpc();

        // Seed initial liquidity by authority
        const authX = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            authority,
            mintX,
            authority.publicKey
        );

        const authY = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            authority,
            mintY,
            authority.publicKey
        );

        // Mint tokens to authority
        await mintTo(
            provider.connection,
            authority,
            mintX,
            authX.address,
            authority,
            1_000_000_000 // 1000 tokens with 6 decimals
        );

        await mintTo(
            provider.connection,
            authority,
            mintY,
            authY.address,
            authority,
            2_000_000_000 // 1000 tokens with 6 decimals
        );

        const userLpAta = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            authority,
            lpMintPda,
            authority.publicKey,
        );

        await program.methods
            .deposit(new anchor.BN(100_000_000), new anchor.BN(200_000_000), new anchor.BN(1))
            .accounts({
                user: authority.publicKey,
                config: configPda,
                mintX: mintX,
                mintY: mintY,
                lpMint: lpMintPda,
                userX: authX.address,
                userY: authY.address,
                userLp: userLpAta.address,
                vaultX: vaultXPda,
                vaultY: vaultYPda,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .signers([authority])
            .rpc();

        // fund trader with token X
        const traderX = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            trader,
            mintX,
            trader.publicKey
        );
        await mintTo(
            provider.connection,
            authority,
            mintX,
            traderX.address,
            authority,
            10_000_000
        );

        // fund trader with token Y (for Y -> X swap)
        const traderY = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            trader,
            mintY,
            trader.publicKey
        );
        await mintTo(
            provider.connection,
            authority,
            mintY,
            traderY.address,
            authority,
            10_000_000
        );
    });

    it("Swaps X -> Y successfully", async () => {
        const traderX = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            trader,
            mintX,
            trader.publicKey
        );
        const traderY = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            trader,
            mintY,
            trader.publicKey,
        );

        const amountIn = new anchor.BN(1_000_000); // 1 token
        const mintOut = new anchor.BN(1); // any positive

        const tx = await program.methods
            .swap(true, amountIn, mintOut)
            .accounts({
                user: trader.publicKey,
                config: configPda,
                mintX: mintX,
                mintY: mintY,
                userX: traderX.address,
                userY: traderY.address,
                vaultX: vaultXPda,
                vaultY: vaultYPda,
                tokenProgram: TOKEN_PROGRAM_ID
            })
            .signers([trader])
            .rpc();
        console.log("Swap X -> Y tx: ", tx);

        const outAfter = await getAccount(
            provider.connection,
            traderY.address
        );
        expect(Number(outAfter.amount)).to.be.greaterThan(0);
    });

    it("Swaps Y -> X successfully with min_out check", async () => {
        const traderX = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            trader,
            mintX,
            trader.publicKey,
        );
        const traderY = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            trader,
            mintY,
            trader.publicKey,
        );

        const amountIn = new anchor.BN(2_000_000); // 2 tokens
        const mintOut = new anchor.BN(1);

        await program.methods
            .swap(false, amountIn, mintOut)
            .accounts({
                user: trader.publicKey,
                config: configPda,
                mintX: mintX,
                mintY: mintY,
                userX: traderX.address,
                userY: traderY.address,
                vaultX: vaultXPda,
                vaultY: vaultYPda,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([trader])
            .rpc();

        const outAfter = await getAccount(
            provider.connection,
            traderX.address
        );
        expect(Number(outAfter.amount)).to.be.greaterThan(0);
    });

    it("Fails when slippage exceeded", async () => {
        const traderX = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            trader,
            mintX,
            trader.publicKey
        );
        const traderY = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            trader,
            mintY,
            trader.publicKey,
        );

        const amountIn = new anchor.BN(1_000_000);
        const absurdMintOut = new anchor.BN(10_000_000_000); // intentionally too high

        try {
            await program.methods
                .swap(true, amountIn, absurdMintOut)
                .accounts({
                    user: trader.publicKey,
                    config: configPda,
                    mintX: mintX,
                    mintY: mintY,
                    userX: traderX.address,
                    userY: traderY.address,
                    vaultX: vaultXPda,
                    vaultY: vaultYPda,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([trader])
                .rpc();
            expect.fail("Should have failed with SlippageExceeded");
        } catch (error) {
            expect(error.message).to.include("SlippageExceeded");
        }
    });
});