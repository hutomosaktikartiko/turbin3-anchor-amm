import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";
import { Amm } from "../target/types/amm";
import { expect } from "chai";

describe("AMM Withdraw", () => {
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

    seed = new anchor.BN(Math.floor(Math.random() * 1_000_000));

    await Promise.all([
      provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(authority.publicKey, 2_000_000_000)
      ),
      provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(user.publicKey, 2_000_000_000)
      ),
    ]);

    mintX = await createMint(provider.connection, authority, authority.publicKey, null, 6);
    mintY = await createMint(provider.connection, authority, authority.publicKey, null, 6);

    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    [lpMintPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("lp_mint"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    [vaultXPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_x"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    [vaultYPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_y"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

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

    await mintTo(
      provider.connection,
      authority,
      mintX,
      userXAccount.address,
      authority,
      1_000_000_000
    );
    await mintTo(
      provider.connection,
      authority,
      mintY,
      userYAccount.address,
      authority,
      1_000_000_000
    );
  });

  it("Successfull withdraws liquidity", async () => {
    const amountX = new anchor.BN(100_000_000);
    const amountY = new anchor.BN(200_000_000);
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

    const lpBalance = await getAccount(provider.connection, userLpAccount.address);
    const lpToWithdraw = new anchor.BN(Number(lpBalance.amount) / 2);

    const userXBefore = await getAccount(provider.connection, userXAccount.address);
    const userYBefore = await getAccount(provider.connection, userYAccount.address);

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

    const userXAfter = await getAccount(provider.connection, userXAccount.address);
    const userYAfter = await getAccount(provider.connection, userYAccount.address);

    expect(Number(userXAfter.amount)).to.be.greaterThan(Number(userXBefore.amount));
    expect(Number(userYAfter.amount)).to.be.greaterThan(Number(userYBefore.amount));
  });

  it("Fails withdraw with slippage exceeded", async () => {
    const amountX = new anchor.BN(100_000_000);
    const amountY = new anchor.BN(200_000_000);
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

    const lpBalance = await getAccount(provider.connection, userLpAccount.address);
    const lpToWithdraw = new anchor.BN(Number(lpBalance.amount));

    try {
      await program.methods
        .withdraw(
          lpToWithdraw,
          new anchor.BN(1_000_000_000),
          new anchor.BN(1_000_000_000)
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
    } catch (error: any) {
      expect(error.message).to.include("SlippageExceeded");
    }
  });
});


