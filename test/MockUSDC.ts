import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

describe("MockUSDC", async function () {
  const { viem } = await network.create();
  const [deployer, alice, bob] = await viem.getWalletClients();

  async function deployToken() {
    return viem.deployContract("MockUSDC");
  }

  it("mints 6-decimal test USDC only through the demo operator", async function () {
    const token = await deployToken();
    const amount = 100_000_000n; // 100 mUSDC

    assert.equal(await token.read.name(), "Mock USD Coin");
    assert.equal(await token.read.symbol(), "mUSDC");
    assert.equal(await token.read.decimals(), 6);
    assert.equal((await token.read.owner()).toLowerCase(), deployer.account.address.toLowerCase());

    await token.write.mint([alice.account.address, amount], { account: deployer.account });
    assert.equal(await token.read.balanceOf([alice.account.address]), amount);
    assert.equal(await token.read.totalSupply(), amount);

    await assert.rejects(
      token.write.mint([bob.account.address, amount], { account: alice.account }),
      /OnlyOwner/,
    );
  });

  it("allows an approved market contract to transfer a user's test USDC", async function () {
    const token = await deployToken();
    const minted = 100_000_000n;
    const staked = 25_000_000n;

    await token.write.mint([alice.account.address, minted], { account: deployer.account });
    await token.write.approve([bob.account.address, staked], { account: alice.account });
    await token.write.transferFrom([alice.account.address, bob.account.address, staked], {
      account: bob.account,
    });

    assert.equal(await token.read.balanceOf([alice.account.address]), minted - staked);
    assert.equal(await token.read.balanceOf([bob.account.address]), staked);
  });

  it("lets every test wallet claim the faucet exactly once", async function () {
    const token = await deployToken();
    const faucetAmount = await token.read.FAUCET_AMOUNT();

    await token.write.claimFaucet({ account: alice.account });
    await token.write.claimFaucet({ account: bob.account });

    assert.equal(await token.read.balanceOf([alice.account.address]), faucetAmount);
    assert.equal(await token.read.balanceOf([bob.account.address]), faucetAmount);
    await assert.rejects(token.write.claimFaucet({ account: alice.account }), /FaucetAlreadyClaimed/);
  });
});
