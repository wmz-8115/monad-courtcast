import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readOperatorRuntimeConfig } from "../backend/operatorChainAdapter.js";

describe("operator runtime configuration", () => {
  it("reads a complete configuration without exposing the secret", () => {
    const config = readOperatorRuntimeConfig({
      POINTPULSE_OPERATOR_PRIVATE_KEY: `0x${"11".repeat(32)}`,
      POINTPULSE_MUSDC_ADDRESS: "0x1111111111111111111111111111111111111111",
      POINTPULSE_MARKET_ADDRESS: "0x2222222222222222222222222222222222222222",
      POINTPULSE_RPC_URL: "https://example.invalid",
    });

    assert.equal(config.mockUsdcAddress, "0x1111111111111111111111111111111111111111");
    assert.equal(config.predictionMarketAddress, "0x2222222222222222222222222222222222222222");
    assert.equal(config.rpcUrl, "https://example.invalid");
  });

  it("rejects an incomplete operator configuration before constructing a signer", () => {
    assert.throws(
      () => readOperatorRuntimeConfig({
        POINTPULSE_OPERATOR_PRIVATE_KEY: "not-a-key",
      }),
      /POINTPULSE_OPERATOR_PRIVATE_KEY/,
    );
  });
});
