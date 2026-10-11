import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

describe("PredictionMarket: Phase 1", async function () {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [creator, oracle, alice, bob] = await viem.getWalletClients();

  async function deployMarket() {
    const token = await viem.deployContract("MockUSDC");
    const market = await viem.deployContract("PredictionMarket", [token.address, oracle.account.address]);
    return { token, market };
  }

  async function createOpenMarket(market: Awaited<ReturnType<typeof deployMarket>>["market"]) {
    const currentBlock = await publicClient.getBlock();
    const closeAt = currentBlock.timestamp + 30n;
    const resolveAt = closeAt + 5n;
    await market.write.createMarket(["Will the next point be an ace?", closeAt, resolveAt], {
      account: creator.account,
    });
    return { closeAt, resolveAt };
  }

  async function moveTimeTo(timestamp: bigint) {
    await publicClient.request({
      method: "evm_setNextBlockTimestamp" as never,
      params: [Number(timestamp)] as never,
    });
    await publicClient.request({ method: "evm_mine" as never, params: [] as never });
  }

  it("creates an OPEN yes/no market with its schedule", async function () {
    const { token, market } = await deployMarket();
    const { closeAt, resolveAt } = await createOpenMarket(market);

    assert.equal((await market.read.settlementToken()).toLowerCase(), token.address.toLowerCase());
    assert.equal((await market.read.oracle()).toLowerCase(), oracle.account.address.toLowerCase());
    assert.equal(await market.read.marketCount(), 1n);

    const created = await market.read.getMarket([0n]);
    assert.equal(created.question, "Will the next point be an ace?");
    assert.equal(created.creator.toLowerCase(), creator.account.address.toLowerCase());
    assert.equal(created.closeAt, closeAt);
    assert.equal(created.resolveAt, resolveAt);
    assert.equal(created.status, 0);
    assert.equal(created.outcome, 0);
    assert.equal(created.yesPool, 0n);
    assert.equal(created.noPool, 0n);
  });

  it("moves approved mUSDC into the market and records a YES or NO position", async function () {
    const { token, market } = await deployMarket();
    await createOpenMarket(market);
    const yesAmount = 10_000_000n; // 10 mUSDC
    const noAmount = 25_000_000n; // 25 mUSDC

    await token.write.mint([alice.account.address, yesAmount + noAmount], {
      account: creator.account,
    });
    await token.write.approve([market.address, yesAmount + noAmount], { account: alice.account });
    await market.write.bet([0n, 1, yesAmount], { account: alice.account });
    await market.write.bet([0n, 2, noAmount], { account: alice.account });

    const created = await market.read.getMarket([0n]);
    const position = await market.read.getUserPosition([0n, alice.account.address]);
    assert.equal(created.yesPool, yesAmount);
    assert.equal(created.noPool, noAmount);
    assert.deepEqual(position, [yesAmount, noAmount]);
    assert.equal(await token.read.balanceOf([market.address]), yesAmount + noAmount);
    assert.equal(await token.read.balanceOf([alice.account.address]), 0n);
  });

  it("rejects unresolved, empty, and late bets", async function () {
    const { token, market } = await deployMarket();
    const { closeAt } = await createOpenMarket(market);
    const amount = 1_000_000n;
    await token.write.mint([alice.account.address, amount], { account: creator.account });
    await token.write.approve([market.address, amount], { account: alice.account });

    await assert.rejects(
      market.write.bet([0n, 0, amount], { account: alice.account }),
      /InvalidSide/,
    );
    await assert.rejects(
      market.write.bet([0n, 1, 0n], { account: alice.account }),
      /ZeroAmount/,
    );

    await moveTimeTo(closeAt);
    await assert.rejects(
      market.write.bet([0n, 1, amount], { account: alice.account }),
      /BettingClosed/,
    );
  });

  it("freezes a market at its betting deadline and prevents further bets", async function () {
    const { token, market } = await deployMarket();
    const { closeAt } = await createOpenMarket(market);
    const amount = 1_000_000n;
    await token.write.mint([alice.account.address, amount], { account: creator.account });
    await token.write.approve([market.address, amount], { account: alice.account });

    await assert.rejects(market.write.freezeMarket([0n]), /BettingStillOpen/);

    await moveTimeTo(closeAt);
    await market.write.freezeMarket([0n], { account: alice.account });

    assert.equal((await market.read.getMarket([0n])).status, 1);
    await assert.rejects(
      market.write.bet([0n, 1, amount], { account: alice.account }),
      /MarketNotOpen/,
    );
  });

  it("lets only the creator void an open or frozen market and refund all stakes", async function () {
    const { token, market } = await deployMarket();
    const { closeAt } = await createOpenMarket(market);
    const aliceStake = 10_000_000n;
    const bobStake = 25_000_000n;

    await token.write.mint([alice.account.address, aliceStake], { account: creator.account });
    await token.write.mint([bob.account.address, bobStake], { account: creator.account });
    await token.write.approve([market.address, aliceStake], { account: alice.account });
    await token.write.approve([market.address, bobStake], { account: bob.account });
    await market.write.bet([0n, 1, aliceStake], { account: alice.account });
    await market.write.bet([0n, 2, bobStake], { account: bob.account });

    await assert.rejects(market.write.cancelMarket([0n], { account: alice.account }), /OnlyCreator/);
    await moveTimeTo(closeAt);
    await market.write.freezeMarket([0n]);
    await market.write.cancelMarket([0n], { account: creator.account });

    assert.equal((await market.read.getMarket([0n])).status, 3);
    await market.write.claim([0n], { account: alice.account });
    await market.write.claim([0n], { account: bob.account });
    assert.equal(await token.read.balanceOf([alice.account.address]), aliceStake);
    assert.equal(await token.read.balanceOf([bob.account.address]), bobStake);
    await assert.rejects(market.write.cancelMarket([0n], { account: creator.account }), /MarketNotCancellable/);
  });

  it("allows only the Oracle to resolve a frozen market after resolveAt", async function () {
    const { market } = await deployMarket();
    const { closeAt, resolveAt } = await createOpenMarket(market);

    await moveTimeTo(closeAt);
    await market.write.freezeMarket([0n]);

    await assert.rejects(
      market.write.resolveMarket([0n, 1], { account: alice.account }),
      /OnlyOracle/,
    );
    await assert.rejects(
      market.write.resolveMarket([0n, 0], { account: oracle.account }),
      /ResolveTooEarly/,
    );

    await moveTimeTo(resolveAt);
    await market.write.resolveMarket([0n, 2], { account: oracle.account });

    const resolved = await market.read.getMarket([0n]);
    assert.equal(resolved.status, 3);
    assert.equal(resolved.outcome, 2);
  });

  it("runs the complete Alice YES / Bob NO flow and pays the winning Bob", async function () {
    const { token, market } = await deployMarket();
    const { closeAt, resolveAt } = await createOpenMarket(market);
    const startingBalance = 100_000_000n; // 100 mUSDC each
    const aliceYes = 10_000_000n;
    const bobNo = 20_000_000n;

    await token.write.mint([alice.account.address, startingBalance], { account: creator.account });
    await token.write.mint([bob.account.address, startingBalance], { account: creator.account });
    await token.write.approve([market.address, aliceYes], { account: alice.account });
    await token.write.approve([market.address, bobNo], { account: bob.account });
    await market.write.bet([0n, 1, aliceYes], { account: alice.account });
    await market.write.bet([0n, 2, bobNo], { account: bob.account });

    await moveTimeTo(closeAt);
    await market.write.freezeMarket([0n]);
    await moveTimeTo(resolveAt);
    await market.write.resolveMarket([0n, 2], { account: oracle.account });

    await assert.rejects(market.write.claim([0n], { account: alice.account }), /NothingToClaim/);
    await market.write.claim([0n], { account: bob.account });

    assert.equal(await token.read.balanceOf([alice.account.address]), startingBalance - aliceYes);
    assert.equal(await token.read.balanceOf([bob.account.address]), startingBalance + aliceYes);
    assert.equal(await token.read.balanceOf([market.address]), 0n);

    const settled = await market.read.getMarket([0n]);
    assert.equal(settled.remainingWinningStake, 0n);
    assert.equal(settled.remainingPayout, 0n);
    await assert.rejects(market.write.claim([0n], { account: bob.account }), /AlreadyClaimed/);
  });

  it("cancels and refunds everyone when nobody backed the Oracle result", async function () {
    const { token, market } = await deployMarket();
    const { closeAt, resolveAt } = await createOpenMarket(market);
    const stake = 10_000_000n;

    await token.write.mint([alice.account.address, stake], { account: creator.account });
    await token.write.approve([market.address, stake], { account: alice.account });
    await market.write.bet([0n, 1, stake], { account: alice.account });

    await moveTimeTo(closeAt);
    await market.write.freezeMarket([0n]);
    await moveTimeTo(resolveAt);
    await market.write.resolveMarket([0n, 2], { account: oracle.account });

    const cancelled = await market.read.getMarket([0n]);
    assert.equal(cancelled.status, 3);
    assert.equal(cancelled.outcome, 2);

    await market.write.claim([0n], { account: alice.account });
    assert.equal(await token.read.balanceOf([alice.account.address]), stake);
    assert.equal(await token.read.balanceOf([market.address]), 0n);
  });

  it("rejects invalid market schedules and blank questions", async function () {
    const { market } = await deployMarket();
    const currentBlock = await publicClient.getBlock();
    const closeAt = currentBlock.timestamp + 30n;

    await assert.rejects(
      market.write.createMarket(["", closeAt, closeAt + 5n], { account: creator.account }),
      /EmptyQuestion/,
    );
    await assert.rejects(
      market.write.createMarket(["Already closed", currentBlock.timestamp, closeAt], {
        account: creator.account,
      }),
      /CloseTimeNotFuture/,
    );
    await assert.rejects(
      market.write.createMarket(["Wrong order", closeAt, closeAt - 1n], {
        account: creator.account,
      }),
      /ResolveTimeBeforeClose/,
    );
  });
});
