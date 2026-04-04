import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isOpenMode } from "../lib/auth";
import { NebullaWorkspaceShell } from "../nebulla-workspace/NebullaWorkspaceShell";

const KEY_USER_ID = "kyn_user_id";

export default function NebullaWorkspace() {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isOpenMode() && !localStorage.getItem(KEY_USER_ID)) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  if (typeof window !== "undefined" && !isOpenMode() && !localStorage.getItem(KEY_USER_ID)) {
    return null;
  }

  return <NebullaWorkspaceShell />;
}
