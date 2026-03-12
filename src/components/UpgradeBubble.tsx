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
      className="fixed bottom-6 right-6 z-40 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-full shadow-lg border border-blue-500/50 transition-colors"
    >
      {message}
    </Link>
  );
}
