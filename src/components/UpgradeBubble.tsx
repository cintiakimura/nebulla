import { Link } from "react-router-dom";

type Props = {
  show: boolean;
  message?: string;
};

export default function UpgradeBubble({ show, message = "Upgrade to Pro for unlimited" }: Props) {
  if (!show) return null;
  return (
    <Link
      to="/pricing"
      className="fixed bottom-6 right-6 z-40 px-4 py-2.5 bg-[#00BFFF] hover:bg-[#40d4ff] text-black text-sm font-medium rounded-full shadow-lg border border-[#00BFFF]/50 transition-colors"
    >
      {message}
    </Link>
  );
}
