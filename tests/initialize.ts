import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Amm } from "../target/types/amm";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createMint} from "@solana/spl-token";
import { expect } from "chai";

describe("AMM Pool Initialization", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.amm as Program<Amm>;

  let mintX: PublicKey;
  let mintY: PublicKey;
  let authority: Keypair;

  beforeEach(async () => {
    authority = Keypair.generate();

    // Airdrop SOL to authority
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(authority.publicKey, 2000000000)
    )

    // Create test token mints
    mintX = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      6
    );
    mintY = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      6,
    );
  });

  it("Sucessfully initialized a new pool", async () => {
    const seed = new anchor.BN(12345);
    const fee = 300; // 3%

    // Derive PDA addresses
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );

    const [lpMintPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("lp_mint"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );

    const [vaultXPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_x"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );

    const [vaultYPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_y"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );

    // Initialize the pool
    const tx = await program.methods
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

    console.log("Initialize transaction signature: ", tx);

    // Verify config account was created correctly
    const configAccount = await program.account.config.fetch(configPda);
    expect(configAccount.seed.toString()).to.equal(seed.toString());
    expect(configAccount.fee).to.equal(fee);
    expect(configAccount.mintX.toString()).to.equal(mintX.toString());
    expect(configAccount.mintY.toString()).to.equal(mintY.toString());
    expect(configAccount.locked).to.be.false;
  });

  it("Fails with invalid fee", async () => {
    const seed = new anchor.BN(12346);
    const fee = 10000; // 100% fee - should fail

    // Derive PDA addresses
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );

    const [lpMintPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("lp_mint"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );

    const [vaultXPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_x"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );

    const [vaultYPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_y"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );

    try {
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
      
        expect.fail("Should have failed with invalid fee.");
    } catch (error) {
      expect(error.message).to.include("InvalidFee");
    }
  });

  it("Fails when mint X equals mint Y", async () => {
    const seed = new anchor.BN(12347);
    const fee = 300;

    // Derive PDA addresses
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );

    const [lpMintPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("lp_mint"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );

    const [vaultXPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_x"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );

    const [vaultYPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_y"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );

    try {
      await program.methods
        .initialize(seed, fee)
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          mintX: mintX,
          mintY: mintX, // Same mint - should fail
          lpMint: lpMintPda,
          vaultX: vaultXPda,
          vaultY: vaultYPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
      
        expect.fail("Should have failed with same mints.");
    } catch (error) {
      expect(error.message).to.include("InvalidToken");
    }
  })
});
