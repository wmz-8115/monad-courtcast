import type { Address } from "viem";

import { getBrowserWallet } from "../wallet/provider.js";

type NonceReply = { nonce?: unknown; message?: unknown };
type SessionReply = {
  active?: unknown;
  canStart?: unknown;
  mode?: unknown;
  retryAt?: unknown;
  error?: unknown;
};

export type OperatorSession = {
  active: boolean;
  canStart: boolean;
  mode: "public-demo" | "managed";
  retryAt?: number;
};

const configuredApiUrl = (import.meta.env.VITE_OPERATOR_API_URL as string | undefined)?.trim();

function operatorUrl(path: string) {
  if (configuredApiUrl === undefined || configuredApiUrl === "") return undefined;
  return `${configuredApiUrl.replace(/\/$/, "")}${path}`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json().catch(() => ({}));
  return typeof body === "object" && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

function messageOf(body: Record<string, unknown>, fallback: string) {
  return typeof body.error === "string" ? body.error : fallback;
}

/** The Site stays read-only without this private service; no browser sees a key. */
export function hasOperatorSessionApi() {
  return operatorUrl("") !== undefined;
}

export async function getOperatorSession() {
  const url = operatorUrl("/v1/session");
  if (url === undefined) return undefined;
  const response = await fetch(url, { cache: "no-store" });
  const body = await readJson(response) as SessionReply;
  if (!response.ok) throw new Error(messageOf(body, "无法读取运营演示状态。"));
  const mode = body.mode === "public-demo" ? "public-demo" : "managed";
  const retryAt = typeof body.retryAt === "number" && Number.isSafeInteger(body.retryAt) ? body.retryAt : undefined;
  return {
    active: body.active === true,
    canStart: body.canStart === true,
    mode,
    retryAt,
  } satisfies OperatorSession;
}

/**
 * Starts one real, server-owned replay session. In managed mode MetaMask only
 * signs an intent; in public-demo mode the service enforces its fixed plan,
 * one live run, a cooldown, and a total-run cap. Transactions always originate
 * from the private operator process.
 */
export async function startOperatorSession(session: OperatorSession, address?: Address) {
  const startUrl = operatorUrl("/v1/session/start");
  if (startUrl === undefined) throw new Error("尚未配置私有运营服务。仅视频会播放，不会创建模拟市场。");

  if (session.mode === "public-demo") {
    const startResponse = await fetch(startUrl, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const startBody = await readJson(startResponse) as SessionReply;
    if (!startResponse.ok) throw new Error(messageOf(startBody as Record<string, unknown>, "无法启动链上演示。"));
    return startBody.active === true;
  }

  const nonceUrl = operatorUrl("/v1/session/nonce");
  if (nonceUrl === undefined || address === undefined) throw new Error("请先连接允许启动演示的管理钱包。");

  const nonceResponse = await fetch(nonceUrl, { method: "POST" });
  const nonceBody = await readJson(nonceResponse) as NonceReply;
  if (!nonceResponse.ok || typeof nonceBody.nonce !== "string" || typeof nonceBody.message !== "string") {
    throw new Error(messageOf(nonceBody as Record<string, unknown>, "无法取得本次演示的签名请求。"));
  }

  const signature = await getBrowserWallet().request({ method: "personal_sign", params: [nonceBody.message, address] });
  if (typeof signature !== "string") throw new Error("钱包没有返回有效签名。" );

  const startResponse = await fetch(startUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, nonce: nonceBody.nonce, signature }),
  });
  const startBody = await readJson(startResponse) as SessionReply;
  if (!startResponse.ok) throw new Error(messageOf(startBody as Record<string, unknown>, "无法启动链上演示。"));
  return startBody.active === true;
}
