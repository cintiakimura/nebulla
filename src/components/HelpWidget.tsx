import { useLocation } from "react-router-dom";
import HelpWidgetBubble from "./HelpWidgetBubble";
import HelpWidgetPanel from "./HelpWidgetPanel";
import BackendMissingBanner from "./BackendMissingBanner";

const PROTECTED_PATHS = [
  "/dashboard",
  "/builder",
  "/setup",
  "/settings",
  "/onboarding",
  "/master-plan-brainstorming",
];

function useIsProtectedRoute(): boolean {
  const { pathname } = useLocation();
  return PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Renders the floating help widget (bubble + panel) and backend-missing banner only on protected pages after login.
 * Must be used inside HelpWidgetProvider and BrowserRouter.
 */
export default function HelpWidget() {
  const isProtected = useIsProtectedRoute();
  if (!isProtected) return null;
  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-[9996]">
        <BackendMissingBanner />
      </div>
      <HelpWidgetBubble />
      <HelpWidgetPanel />
    </>
  );
}
