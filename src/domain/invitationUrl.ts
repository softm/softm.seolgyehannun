export function buildInvitationUrl(
  origin: string,
  organizationId: string,
  token: string,
  hashRouting: boolean,
): string {
  const normalizedOrigin = origin.replace(/\/$/, "");
  const route = `/invite?organizationId=${encodeURIComponent(organizationId)}&token=${encodeURIComponent(token)}`;
  return `${normalizedOrigin}${hashRouting ? "/#" : ""}${route}`;
}
