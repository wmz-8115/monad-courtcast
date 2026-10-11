// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Like {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

/// @title PredictionMarket
/// @notice Short-lived market registry for the PointPulse testnet demo.
/// @dev Supports creation, YES/NO bets, freezing, Oracle settlement, creator
///      voiding before settlement, and permissionless winner/refund claims.
contract PredictionMarket {
    enum MarketStatus {
        Open,
        Frozen,
        Resolved,
        Cancelled
    }

    enum Outcome {
        Unresolved,
        Yes,
        No
    }

    struct Market {
        string question;
        address creator;
        uint64 closeAt;
        uint64 resolveAt;
        MarketStatus status;
        Outcome outcome;
        uint256 yesPool;
        uint256 noPool;
        uint256 remainingWinningStake;
        uint256 remainingPayout;
    }

    IERC20Like public immutable settlementToken;
    address public immutable oracle;
    uint256 public marketCount;

    mapping(uint256 marketId => Market market) private markets;
    mapping(uint256 marketId => mapping(address user => mapping(Outcome side => uint256 amount)))
        private stakes;
    mapping(uint256 marketId => mapping(address user => bool claimed)) private hasClaimed;

    error ZeroAddress();
    error EmptyQuestion();
    error CloseTimeNotFuture(uint64 closeAt, uint64 currentTime);
    error ResolveTimeBeforeClose(uint64 closeAt, uint64 resolveAt);
    error MarketNotFound(uint256 marketId);
    error OnlyCreator(address caller, address creator);
    error MarketNotCancellable(uint256 marketId, MarketStatus status);
    error ZeroAmount();
    error InvalidSide(Outcome side);
    error MarketNotOpen(uint256 marketId, MarketStatus status);
    error BettingClosed(uint256 marketId, uint64 closeAt);
    error BettingStillOpen(uint256 marketId, uint64 closeAt);
    error OnlyOracle(address caller);
    error MarketNotFrozen(uint256 marketId, MarketStatus status);
    error ResolveTooEarly(uint256 marketId, uint64 resolveAt);
    error MarketNotFinalized(uint256 marketId, MarketStatus status);
    error AlreadyClaimed(uint256 marketId, address user);
    error NothingToClaim(uint256 marketId, address user);
    error TokenTransferFailed();

    event MarketCreated(
        uint256 indexed marketId,
        address indexed creator,
        string question,
        uint64 closeAt,
        uint64 resolveAt
    );
    event BetPlaced(
        uint256 indexed marketId,
        address indexed bettor,
        Outcome indexed side,
        uint256 amount
    );
    event MarketFrozen(uint256 indexed marketId);
    event MarketResolved(uint256 indexed marketId, Outcome indexed outcome);
    event MarketCancelled(uint256 indexed marketId, Outcome indexed outcome);
    event MarketVoided(uint256 indexed marketId, address indexed creator);
    event Claimed(uint256 indexed marketId, address indexed claimant, uint256 amount);

    constructor(address settlementToken_, address oracle_) {
        if (settlementToken_ == address(0) || oracle_ == address(0)) revert ZeroAddress();

        settlementToken = IERC20Like(settlementToken_);
        oracle = oracle_;
    }

    /// @notice Creates a two-outcome market in the initial Open state.
    function createMarket(
        string calldata question,
        uint64 closeAt,
        uint64 resolveAt
    ) external returns (uint256 marketId) {
        uint64 currentTime = uint64(block.timestamp);
        if (bytes(question).length == 0) revert EmptyQuestion();
        if (closeAt <= currentTime) revert CloseTimeNotFuture(closeAt, currentTime);
        if (resolveAt < closeAt) revert ResolveTimeBeforeClose(closeAt, resolveAt);

        marketId = marketCount;
        marketCount += 1;

        markets[marketId] = Market({
            question: question,
            creator: msg.sender,
            closeAt: closeAt,
            resolveAt: resolveAt,
            status: MarketStatus.Open,
            outcome: Outcome.Unresolved,
            yesPool: 0,
            noPool: 0,
            remainingWinningStake: 0,
            remainingPayout: 0
        });

        emit MarketCreated(marketId, msg.sender, question, closeAt, resolveAt);
    }

    /// @notice Places a fixed-size bet while the market is open.
    /// @dev The caller must first approve this contract to transfer `amount` mUSDC.
    function bet(uint256 marketId, Outcome side, uint256 amount) external {
        Market storage market = _getExistingMarket(marketId);
        if (market.status != MarketStatus.Open) {
            revert MarketNotOpen(marketId, market.status);
        }
        if (block.timestamp >= market.closeAt) revert BettingClosed(marketId, market.closeAt);
        if (side != Outcome.Yes && side != Outcome.No) revert InvalidSide(side);
        if (amount == 0) revert ZeroAmount();

        // Transfer before recording the position. A failed token payment cannot create a bet.
        if (!settlementToken.transferFrom(msg.sender, address(this), amount)) {
            revert TokenTransferFailed();
        }

        stakes[marketId][msg.sender][side] += amount;
        if (side == Outcome.Yes) {
            market.yesPool += amount;
        } else {
            market.noPool += amount;
        }

        emit BetPlaced(marketId, msg.sender, side, amount);
    }

    /// @notice Freezes a market after its betting deadline. Anyone may trigger it.
    function freezeMarket(uint256 marketId) external {
        Market storage market = _getExistingMarket(marketId);
        if (market.status != MarketStatus.Open) {
            revert MarketNotOpen(marketId, market.status);
        }
        if (block.timestamp < market.closeAt) {
            revert BettingStillOpen(marketId, market.closeAt);
        }

        market.status = MarketStatus.Frozen;
        emit MarketFrozen(marketId);
    }

    /// @notice Lets the market creator void an unfinalized demo market.
    /// @dev Every participant can then call claim() to recover their original
    ///      stake. This is deliberately a trusted operator power for the
    ///      prerecorded-demo workflow; a production protocol needs stronger
    ///      governance and disclosure controls.
    function cancelMarket(uint256 marketId) external {
        Market storage market = _getExistingMarket(marketId);
        if (msg.sender != market.creator) revert OnlyCreator(msg.sender, market.creator);
        if (market.status != MarketStatus.Open && market.status != MarketStatus.Frozen) {
            revert MarketNotCancellable(marketId, market.status);
        }

        market.status = MarketStatus.Cancelled;
        emit MarketVoided(marketId, msg.sender);
    }

    /// @notice Lets the designated Oracle submit the final YES or NO outcome.
    /// @dev If nobody backed the winning result, the market becomes Cancelled
    ///      and every bettor may reclaim their original stake.
    function resolveMarket(uint256 marketId, Outcome outcome) external {
        if (msg.sender != oracle) revert OnlyOracle(msg.sender);

        Market storage market = _getExistingMarket(marketId);
        if (market.status != MarketStatus.Frozen) {
            revert MarketNotFrozen(marketId, market.status);
        }
        if (block.timestamp < market.resolveAt) {
            revert ResolveTooEarly(marketId, market.resolveAt);
        }
        if (outcome != Outcome.Yes && outcome != Outcome.No) revert InvalidSide(outcome);

        market.outcome = outcome;
        uint256 winningPool = outcome == Outcome.Yes ? market.yesPool : market.noPool;
        if (winningPool == 0) {
            market.status = MarketStatus.Cancelled;
            emit MarketCancelled(marketId, outcome);
            return;
        }

        market.status = MarketStatus.Resolved;
        market.remainingWinningStake = winningPool;
        market.remainingPayout = market.yesPool + market.noPool;
        emit MarketResolved(marketId, outcome);
    }

    /// @notice Pays a winner's proportional share, or refunds a cancelled market.
    /// @dev State is updated before the token transfer. The final winning claimant
    ///      receives any integer-division remainder, so no mUSDC is stranded.
    function claim(uint256 marketId) external returns (uint256 payout) {
        Market storage market = _getExistingMarket(marketId);
        if (market.status != MarketStatus.Resolved && market.status != MarketStatus.Cancelled) {
            revert MarketNotFinalized(marketId, market.status);
        }
        if (hasClaimed[marketId][msg.sender]) revert AlreadyClaimed(marketId, msg.sender);

        uint256 yesStake = stakes[marketId][msg.sender][Outcome.Yes];
        uint256 noStake = stakes[marketId][msg.sender][Outcome.No];

        if (market.status == MarketStatus.Cancelled) {
            payout = yesStake + noStake;
        } else {
            uint256 winningStake = market.outcome == Outcome.Yes ? yesStake : noStake;
            if (winningStake == 0) revert NothingToClaim(marketId, msg.sender);

            if (winningStake == market.remainingWinningStake) {
                payout = market.remainingPayout;
            } else {
                uint256 totalPayout = market.yesPool + market.noPool;
                uint256 winningPool = market.outcome == Outcome.Yes ? market.yesPool : market.noPool;
                payout = (winningStake * totalPayout) / winningPool;
            }

            market.remainingWinningStake -= winningStake;
            market.remainingPayout -= payout;
        }

        if (payout == 0) revert NothingToClaim(marketId, msg.sender);

        hasClaimed[marketId][msg.sender] = true;
        if (!settlementToken.transfer(msg.sender, payout)) revert TokenTransferFailed();
        emit Claimed(marketId, msg.sender, payout);
    }

    function getMarket(uint256 marketId) external view returns (Market memory market) {
        return _getExistingMarket(marketId);
    }

    function getUserPosition(
        uint256 marketId,
        address user
    ) external view returns (uint256 yesStake, uint256 noStake) {
        _getExistingMarket(marketId);
        yesStake = stakes[marketId][user][Outcome.Yes];
        noStake = stakes[marketId][user][Outcome.No];
    }

    function _getExistingMarket(uint256 marketId) private view returns (Market storage market) {
        if (marketId >= marketCount) revert MarketNotFound(marketId);
        return markets[marketId];
    }
}
