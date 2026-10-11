import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys the Phase 1 contracts in dependency order:
 * MockUSDC first, then PredictionMarket using it as the settlement token.
 *
 * Unless an `oracle` parameter is supplied, the deploying wallet is the Oracle.
 */
export default buildModule("PointPulseModule", (m) => {
  const oracle = m.getParameter("oracle", m.getAccount(0));
  const mockUsdc = m.contract("MockUSDC");
  const predictionMarket = m.contract("PredictionMarket", [mockUsdc, oracle]);

  return { mockUsdc, predictionMarket };
});
