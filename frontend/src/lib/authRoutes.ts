/** Routes that require a signed-in user (Chat `/` is always public). */

export const PUBLIC_PATHS = new Set(["/", "/login"]);

export function pathRequiresAuth(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return false;
  return true;
}

export const AUTH_LOGIN_PATH = "/login";
