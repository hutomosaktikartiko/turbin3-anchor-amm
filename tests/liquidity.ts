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

describe("AMM Liquidity Management", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.Amm as Program<Amm>;

    let mintX: PublicKey;
    let mintY: PublicKey;
    let authority: Keypair;
    let user: Keypair;
    let configPda: PublicKey;
    let lpMintPda: PublicKey;
    let vaultXPda: PublicKey;
    let vaultYPda: PublicKey;
    let seed: anchor.BN;
    const fee = 300; // 3%

    beforeEach(async () => {
        authority = Keypair.generate();
        user = Keypair.generate();
        
        // Generate random seed for each test to avoid account conflicts
        seed = new anchor.BN(Math.floor(Math.random() * 1000000));

        // airdrop SOL
        await Promise.all([
            provider.connection.confirmTransaction(
                await provider.connection.requestAirdrop(
                    authority.publicKey,
                    2000000000
                )
            ),
            provider.connection.confirmTransaction(
                await provider.connection.requestAirdrop(
                    user.publicKey,
                    2000000000
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

        // Create user token accounts and mint tokens
        const userXAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            user,
            mintX,
            user.publicKey
        );

        const userYAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            user,
            mintY,
            user.publicKey
        );

        // Mint tokens to user
        await mintTo(
            provider.connection,
            authority,
            mintX,
            userXAccount.address,
            authority,
            1000000000 // 1000 tokens with 6 decimals
        );

        await mintTo(
            provider.connection,
            authority,
            mintY,
            userYAccount.address,
            authority,
            1000000000 // 1000 tokens with 6 decimals
        );
    });

    it("Successfully deposits first liquidity", async () => {
        const amountX = new anchor.BN(100000000); // 100 tokens
        const amountY = new anchor.BN(200000000); // 200 tokens
        const mintLp = new anchor.BN(1); // minimum LP tokens

        // get user token accounts
        const userXAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            user,
            mintX,
            user.publicKey,
        );

        const userYAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            user,
            mintY,
            user.publicKey,
        );

        const userLpAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            user,
            lpMintPda,
            user.publicKey,
        );

        // deposit liquidity
        const tx = await program.methods
            .deposit(amountX, amountY, mintLp)
            .accounts({
                user: user.publicKey,
                config: configPda,
                mintX: mintX,
                mintY: mintY,
                lpMint: lpMintPda,
                userX: userXAccount.address,
                userY: userYAccount.address,
                userLp: userLpAccount.address,
                vaultX: vaultXPda,
                vaultY: vaultYPda,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .signers([user])
            .rpc();

        console.log("Deposit transaction signature: ", tx);

        // verify balances
        const vaultXAccount = await getAccount(provider.connection, vaultXPda);
        const vaultYAccount = await getAccount(provider.connection, vaultYPda);
        const userLpAccountInfo = await getAccount(
            provider.connection,
            userLpAccount.address,
        );

        expect(vaultXAccount.amount.toString()).to.equal(amountX.toString());
        expect(vaultYAccount.amount.toString()).to.equal(amountY.toString());
        expect(Number(userLpAccountInfo.amount)).to.be.greaterThan(0);

        console.log("LP tokens received: ", userLpAccountInfo.amount.toString());
    });

    it("Successfully deposits subsequent liquidity", async () => {
        // first deposit
        const amountX1 = new anchor.BN(100000000);
        const amountY1 = new anchor.BN(200000000);
        const minLp1 = new anchor.BN(1);

        const userXAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            user,
            mintX,
            user.publicKey,
        );

        const userYAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            user,
            mintY,
            user.publicKey,
        );

        const userLpAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            user,
            lpMintPda,
            user.publicKey,
        );

        await program.methods
            .deposit(amountX1, amountY1, minLp1)
            .accounts({
                user: user.publicKey,
                config: configPda,
                mintX: mintX,
                mintY: mintY,
                lpMint: lpMintPda,
                userX: userXAccount.address,
                userY: userYAccount.address,
                userLp: userLpAccount.address,
                vaultX: vaultXPda,
                vaultY: vaultYPda,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .signers([user])
            .rpc();

        // second deposit
        const amountX2 = new anchor.BN(50000000); // 50 tokens
        const amountY2 = new anchor.BN(100000000); // 100 tokens (same ratio)
        const minLp2 = new anchor.BN(1);
    
        const balanceBefore = await getAccount(
          provider.connection,
          userLpAccount.address
        );
    
        await program.methods
          .deposit(amountX2, amountY2, minLp2)
          .accounts({
            user: user.publicKey,
            config: configPda,
            mintX: mintX,
            mintY: mintY,
            lpMint: lpMintPda,
            userX: userXAccount.address,
            userY: userYAccount.address,
            userLp: userLpAccount.address,
            vaultX: vaultXPda,
            vaultY: vaultYPda,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([user])
          .rpc();
    
        const balanceAfter = await getAccount(
          provider.connection,
          userLpAccount.address
        );
        const lpReceived =
          Number(balanceAfter.amount) - Number(balanceBefore.amount);
    
        expect(lpReceived).to.be.greaterThan(0);
        console.log("Additional LP tokens received:", lpReceived);
    });

    it("Successfull withdraws liquidity", async () => {
        // first deposit liquidity
        const amountX = new anchor.BN(100000000);
        const amountY = new anchor.BN(200000000);
        const minLp = new anchor.BN(1);

        const userXAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            user,
            mintX,
            user.publicKey,
        );

        const userYAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            user,
            mintY,
            user.publicKey,
        );

        const userLpAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            user,
            lpMintPda,
            user.publicKey,
        );

        await program.methods
            .deposit(amountX, amountY, minLp)
            .accounts({
                user: user.publicKey,
                config: configPda,
                mintX: mintX,
                mintY: mintY,
                lpMint: lpMintPda, 
                userX: userXAccount.address,
                userY: userYAccount.address,
                userLp: userLpAccount.address,
                vaultX: vaultXPda,
                vaultY: vaultYPda,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .signers([user])
            .rpc();

        // get LP balance
        const lpBalance = await getAccount(
            provider.connection,
            userLpAccount.address,
        );
        const lpToWithdraw = new anchor.BN(Number(lpBalance.amount) / 2); // half of balance

        // get balances before withdrawal
        const userXBefore = await getAccount(
            provider.connection,
            userXAccount.address,
        );
        const userYBefore = await getAccount(
            provider.connection,
            userYAccount.address,
        );

        // withdraw liquidity
        await program.methods
            .withdraw(lpToWithdraw, new anchor.BN(1), new anchor.BN(1))
            .accounts({
                user: user.publicKey,
                config: configPda,
                mintX: mintX,
                mintY: mintY,
                lpMint: lpMintPda, 
                userX: userXAccount.address,
                userY: userYAccount.address,
                userLp: userLpAccount.address,
                vaultX: vaultXPda,
                vaultY: vaultYPda,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([user])
            .rpc();

        // verify balances increased
        const userXAfter = await getAccount(
            provider.connection,
            userXAccount.address,
        );
        const userYAfter = await getAccount(
            provider.connection,
            userYAccount.address,
        );

        expect(Number(userXAfter.amount)).to.be.greaterThan(
            Number(userXBefore.amount)
        );
        expect(Number(userYAfter.amount)).to.be.greaterThan(
            Number(userYBefore.amount)
        );

        console.log(
            "Tokens X Withdrawn: ", Number(userXAfter.amount) - Number(userXBefore.amount)
        );
        console.log(
            "Tokens Y withdrawn: ", Number(userYAfter.amount) - Number(userYBefore.amount)
        );
    });

    it("Fails deposit with insufficient balance", async () => {
        const amountX = new anchor.BN(2000000000); // More than user has
        const amountY = new anchor.BN(200000000);
        const minLp = new anchor.BN(1);
    
        const userXAccount = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          user,
          mintX,
          user.publicKey
        );
    
        const userYAccount = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          user,
          mintY,
          user.publicKey
        );
    
        const userLpAccount = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          user,
          lpMintPda,
          user.publicKey
        );
    
        try {
          await program.methods
            .deposit(amountX, amountY, minLp)
            .accounts({
              user: user.publicKey,
              config: configPda,
              mintX: mintX,
              mintY: mintY,
              lpMint: lpMintPda,
              userX: userXAccount.address,
              userY: userYAccount.address,
              userLp: userLpAccount.address,
              vaultX: vaultXPda,
              vaultY: vaultYPda,
              tokenProgram: TOKEN_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([user])
            .rpc();
    
          expect.fail("Should have failed with insufficient balance");
        } catch (error) {
          expect(error.message).to.include("InsufficientBalance");
        }
      });
    
      it("Fails withdraw with slippage exceeded", async () => {
        // First deposit liquidity
        const amountX = new anchor.BN(100000000);
        const amountY = new anchor.BN(200000000);
        const minLp = new anchor.BN(1);
    
        const userXAccount = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          user,
          mintX,
          user.publicKey
        );
    
        const userYAccount = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          user,
          mintY,
          user.publicKey
        );
    
        const userLpAccount = await getOrCreateAssociatedTokenAccount(
          provider.connection,
          user,
          lpMintPda,
          user.publicKey
        );
    
        await program.methods
          .deposit(amountX, amountY, minLp)
          .accounts({
            user: user.publicKey,
            config: configPda,
            mintX: mintX,
            mintY: mintY,
            lpMint: lpMintPda,
            userX: userXAccount.address,
            userY: userYAccount.address,
            userLp: userLpAccount.address,
            vaultX: vaultXPda,
            vaultY: vaultYPda,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([user])
          .rpc();
    
        const lpBalance = await getAccount(
          provider.connection,
          userLpAccount.address
        );
        const lpToWithdraw = new anchor.BN(Number(lpBalance.amount));
    
        try {
          // Set unreasonably high minimum amounts
          await program.methods
            .withdraw(
              lpToWithdraw,
              new anchor.BN(1000000000), // Too high min X
              new anchor.BN(1000000000) // Too high min Y
            )
            .accounts({
              user: user.publicKey,
              config: configPda,
              mintX: mintX,
              mintY: mintY,
              lpMint: lpMintPda,
              userX: userXAccount.address,
              userY: userYAccount.address,
              userLp: userLpAccount.address,
              vaultX: vaultXPda,
              vaultY: vaultYPda,
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([user])
            .rpc();
    
          expect.fail("Should have failed with slippage exceeded");
        } catch (error) {
          expect(error.message).to.include("SlippageExceeded");
        }
      });
});