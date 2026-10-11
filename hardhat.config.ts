import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    version: "0.8.34",
    settings: {
      evmVersion: "osaka",
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: { type: "edr-simulated" },
  },
});
