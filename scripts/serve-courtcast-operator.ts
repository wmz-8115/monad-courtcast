import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { isAddress, verifyMessage, type Address, type Hex } from "viem";

import { MonadOperatorChainAdapter, readOperatorRuntimeConfig } from "../backend/operatorChainAdapter.js";
import { DemoOperator } from "../engine/demoOperator.js";
import { prerecordedTennisMarkets } from "../engine/prerecordedScenario.js";

type PendingNonce = { expiresAt: number };

const port = Number.parseInt(process.env.PORT ?? process.env.COURTCAST_OPERATOR_PORT ?? "8787", 10);
const allowedOrigin = process.env.COURTCAST_OPERATOR_ALLOWED_ORIGIN;
const adminAddressText = process.env.COURTCAST_OPERATOR_ADMIN_ADDRESS;
const publicDemoStart = process.env.COURTCAST_DEMO_PUBLIC_START === "true";
const cooldownSeconds = Number.parseInt(process.env.COURTCAST_DEMO_COOLDOWN_SECONDS ?? "300", 10);
const maximumSessions = Number.parseInt(process.env.COURTCAST_DEMO_MAX_SESSIONS ?? "8", 10);
const targetOperatorMusdc = Number.parseInt(process.env.COURTCAST_OPERATOR_TARGET_MUSDC ?? "100000", 10);

if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("COURTCAST_OPERATOR_PORT 必须是有效端口。");
if (allowedOrigin === undefined || allowedOrigin.trim() === "") {
  throw new Error("请设置 COURTCAST_OPERATOR_ALLOWED_ORIGIN 为公开网页的精确来源，例如 https://courtcast.example。");
}
if (!publicDemoStart && (adminAddressText === undefined || !isAddress(adminAddressText))) {
  throw new Error("请设置 COURTCAST_OPERATOR_ADMIN_ADDRESS 为可启动演示的管理钱包地址。");
}
if (!Number.isSafeInteger(cooldownSeconds) || cooldownSeconds < 0) throw new Error("COURTCAST_DEMO_COOLDOWN_SECONDS 必须是非负整数。");
if (!Number.isSafeInteger(maximumSessions) || maximumSessions < 1) throw new Error("COURTCAST_DEMO_MAX_SESSIONS 必须是大于零的整数。");
if (!Number.isSafeInteger(targetOperatorMusdc) || targetOperatorMusdc < 0) throw new Error("COURTCAST_OPERATOR_TARGET_MUSDC 必须是非负整数。");

const adminAddress = adminAddressText?.toLowerCase() as Address | undefined;
const adapter = new MonadOperatorChainAdapter(readOperatorRuntimeConfig());
const nonces = new Map<string, PendingNonce>();
let operator: DemoOperator | undefined;
let lastError: string | undefined;
let completedAt: number | undefined;
let sessionCount = 0;
let ticking = false;

function startMessage(nonce: string) {
  return `CourtCast operator start\nNonce: ${nonce}\nChain: 10143`;
}

function cors(response: ServerResponse, request: IncomingMessage) {
  const origin = request.headers.origin;
  if (origin === allowedOrigin) response.setHeader("access-control-allow-origin", allowedOrigin);
  response.setHeader("vary", "Origin");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function reply(response: ServerResponse, request: IncomingMessage, status: number, body: unknown) {
  cors(response, request);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (Buffer.concat(chunks).byteLength > 20_000) throw new Error("请求体过大。");
  }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("请求体必须是 JSON 对象。");
  return body as Record<string, unknown>;
}

function startEligibility() {
  if (operator !== undefined && !operator.isComplete) {
    return { canStart: false, error: "本轮演示正在运行。" };
  }
  if (sessionCount >= maximumSessions) {
    return { canStart: false, error: "本服务的演示次数已达到上限，请联系演示方重置。" };
  }
  if (completedAt !== undefined) {
    const retryAt = completedAt + cooldownSeconds;
    if (retryAt > Math.floor(Date.now() / 1_000)) {
      return { canStart: false, error: "上一轮演示刚结束，请稍后再开始。", retryAt };
    }
  }
  return { canStart: true };
}

function sessionSnapshot() {
  const eligibility = startEligibility();
  if (operator === undefined || operator.sessionStartedAt === undefined) {
    return {
      active: false,
      mode: publicDemoStart ? "public-demo" : "managed",
      ...eligibility,
      completedAt,
      sessionCount,
      maximumSessions,
      lastError,
    };
  }
  return {
    active: !operator.isComplete,
    mode: publicDemoStart ? "public-demo" : "managed",
    ...eligibility,
    startedAt: operator.sessionStartedAt,
    markets: [...operator.onchainMarketIds.entries()].map(([scheduleId, marketId]) => ({ scheduleId, marketId: marketId.toString() })),
    lastError,
    completedAt,
    sessionCount,
    maximumSessions,
  };
}

async function tick() {
  if (operator === undefined || operator.isComplete || ticking) return;
  ticking = true;
  try {
    const executed = await operator.tick(Math.floor(Date.now() / 1_000), adapter);
    for (const action of executed) {
      console.log(`${new Date().toISOString()} ${action.action} ${action.marketId}${action.onchainMarketId === undefined ? "" : ` #${action.onchainMarketId}`}`);
    }
    lastError = undefined;
    if (operator.isComplete) completedAt = Math.floor(Date.now() / 1_000);
  } catch (error) {
    // Leave a failed action pending so a transient RPC error can be retried on
    // the next tick. The status endpoint exposes the error to the operator.
    lastError = error instanceof Error ? error.message : String(error);
    console.error(lastError);
  } finally {
    ticking = false;
  }
}

function startSession() {
  const eligibility = startEligibility();
  if (!eligibility.canStart) return eligibility;
  operator = new DemoOperator(prerecordedTennisMarkets);
  operator.start(Math.floor(Date.now() / 1_000));
  completedAt = undefined;
  lastError = undefined;
  sessionCount += 1;
  void tick();
  return eligibility;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (request.method === "OPTIONS") { cors(response, request); response.writeHead(204); response.end(); return; }
  if (request.headers.origin !== undefined && request.headers.origin !== allowedOrigin) {
    reply(response, request, 403, { error: "不允许的网页来源。" }); return;
  }

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      reply(response, request, 200, { ok: true, mode: publicDemoStart ? "public-demo" : "managed" }); return;
    }

    if (request.method === "GET" && url.pathname === "/v1/session") {
      reply(response, request, 200, sessionSnapshot()); return;
    }

    if (request.method === "POST" && url.pathname === "/v1/session/nonce") {
      if (publicDemoStart) { reply(response, request, 404, { error: "受限公开演示不需要管理钱包签名。" }); return; }
      const nonce = randomUUID();
      nonces.set(nonce, { expiresAt: Date.now() + 5 * 60_000 });
      reply(response, request, 201, { nonce, message: startMessage(nonce), expiresAt: Math.floor((Date.now() + 5 * 60_000) / 1_000) }); return;
    }

    if (request.method === "POST" && url.pathname === "/v1/session/start") {
      const eligibility = startEligibility();
      if (!eligibility.canStart) { reply(response, request, 409, { ...eligibility, ...sessionSnapshot() }); return; }
      if (publicDemoStart) {
        startSession();
        reply(response, request, 201, sessionSnapshot()); return;
      }
      const body = await readJson(request);
      if (typeof body.address !== "string" || !isAddress(body.address) || typeof body.nonce !== "string" || typeof body.signature !== "string") {
        reply(response, request, 400, { error: "缺少有效的钱包地址、nonce 或签名。" }); return;
      }
      const pending = nonces.get(body.nonce);
      nonces.delete(body.nonce);
      if (pending === undefined || pending.expiresAt < Date.now()) { reply(response, request, 401, { error: "启动签名已过期，请重试。" }); return; }
      if (body.address.toLowerCase() !== adminAddress) { reply(response, request, 403, { error: "该钱包不是允许启动演示的管理账号。" }); return; }
      const valid = await verifyMessage({ address: body.address as Address, message: startMessage(body.nonce), signature: body.signature as Hex });
      if (!valid) { reply(response, request, 401, { error: "管理钱包签名无效。" }); return; }

      startSession();
      reply(response, request, 201, sessionSnapshot()); return;
    }

    reply(response, request, 404, { error: "未找到接口。" });
  } catch (error) {
    reply(response, request, 400, { error: error instanceof Error ? error.message : "请求失败。" });
  }
});

async function launch() {
  const balance = await adapter.ensureMinimumBalance(targetOperatorMusdc);
  console.log(`运营账号 mUSDC 余额：${balance / 1_000_000n}（目标 ${targetOperatorMusdc}）。`);

  server.listen(port, "0.0.0.0", () => {
    console.log(`CourtCast 私有运营服务已监听端口 ${port}。允许来源：${allowedOrigin}`);
    console.log(`链上操作钱包：${adapter.account.address}`);
    console.log(`启动模式：${publicDemoStart ? `受限公开演示（最多 ${maximumSessions} 次，冷却 ${cooldownSeconds} 秒）` : "管理钱包签名"}`);
  });
  setInterval(() => void tick(), 1_000);
}

void launch().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
