import { isNodeRoleMethod } from "./method-scopes.js";
import type { GatewayWsClient } from "./server/ws-types.js";

const GATEWAY_ROLES = ["operator", "node"] as const;

export type GatewayRole = (typeof GATEWAY_ROLES)[number];

export function parseGatewayRole(roleRaw: unknown): GatewayRole | null {
  if (roleRaw === "operator" || roleRaw === "node") {
    return roleRaw;
  }
  return null;
}

export function roleCanSkipDeviceIdentity(role: GatewayRole, sharedAuthOk: boolean): boolean {
  return role === "operator" && sharedAuthOk;
}

export function isRoleAuthorizedForMethod(role: GatewayRole, method: string): boolean {
  if (isNodeRoleMethod(method)) {
    return role === "node";
  }
  return role === "operator";
}

export function isClientAuthorizedForMethod(
  client: Pick<GatewayWsClient, "connect" | "internal">,
  method: string,
): boolean {
  const role = parseGatewayRole(client.connect.role ?? "operator");
  if (!role) {
    return false;
  }
  if (isNodeRoleMethod(method)) {
    return role === "node" || (role === "operator" && client.internal?.nodeRoleAuthorized === true);
  }
  return role === "operator";
}
