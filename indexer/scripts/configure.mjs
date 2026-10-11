import { readFile, writeFile } from "node:fs/promises";

const address = process.env.POINTPULSE_MARKET_ADDRESS;
const startBlock = process.env.POINTPULSE_START_BLOCK ?? "latest";

if (!/^0x[a-fA-F0-9]{40}$/.test(address ?? "")) {
  throw new Error("POINTPULSE_MARKET_ADDRESS 必须是已部署 V2 市场合约地址。\n");
}
if (!(startBlock === "latest" || /^\d+$/.test(startBlock))) {
  throw new Error("POINTPULSE_START_BLOCK 必须是区块号或 latest。\n");
}

const template = await readFile(new URL("../config.template.yaml", import.meta.url), "utf8");
const config = template
  .replace("__POINTPULSE_MARKET_ADDRESS__", address)
  .replace("__POINTPULSE_START_BLOCK__", startBlock);
await writeFile(new URL("../config.yaml", import.meta.url), config, "utf8");
console.log(`已生成 config.yaml：${address}，起始区块 ${startBlock}`);
