import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AUTH_LOGIN_PATH } from "@/lib/authRoutes";
import { useAuthStore } from "@/stores/authStore";

export function AuthRequiredRoute() {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();

  if (!token) {
    return (
      <Navigate
        to={AUTH_LOGIN_PATH}
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  return <Outlet />;
}
