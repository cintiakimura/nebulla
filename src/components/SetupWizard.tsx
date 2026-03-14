import { useState, useEffect } from "react";
import { Github, Copy, Check, CreditCard } from "lucide-react";
import {
  getConnectedServices,
  setConnectedService,
  getStripeKey,
  setStripeKey,
  setSetupComplete,
  setDomainVerified,
} from "../lib/setupStorage";

const VERCEL_DNS = { A: "76.76.21.21", CNAME: "cname.vercel-dns.com" };
const GODADDY = "https://www.godaddy.com/domains";
const CLOUDFLARE = "https://dash.cloudflare.com";

type Props = {
  onComplete: () => void;
  /** When true, we're on /setup for tweaks (show "Save" instead of "Done") */
  isTweaks?: boolean;
};

export default function SetupWizard({ onComplete, isTweaks = false }: Props) {
  const [services, setServices] = useState(getConnectedServices());
  const [stripeKey, setStripeKeyState] = useState("");
  const [copied, setCopied] = useState<"A" | "CNAME" | null>(null);

  useEffect(() => {
    setStripeKeyState(getStripeKey());
  }, []);

  const refreshServices = () => setServices(getConnectedServices());

  const handleConnectGitHub = () => {
    // Reuse login OAuth flow; for now mock
    setConnectedService("github", true);
    setTimeout(refreshServices, 300);
  };

  const handleVerifyDomain = () => {
    setDomainVerified(true);
    setTimeout(refreshServices, 100);
  };

  const handleSaveStripe = () => {
    setStripeKey(stripeKey);
    setTimeout(refreshServices, 100);
  };

  const allGreen =
    services.github && services.domainVerified;

  const handleDone = () => {
    if (!isTweaks) {
      setSetupComplete();
    }
    onComplete();
  };

  const copyDns = (type: "A" | "CNAME") => {
    const value = type === "A" ? VERCEL_DNS.A : VERCEL_DNS.CNAME;
    navigator.clipboard.writeText(value);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto bg-background">
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="text-xl font-semibold text-white mb-1">
          Connect Your Tools – One-Time Setup
        </h1>
        <p className="text-sm text-gray-400 mb-8">
          Hey, let's hook up your stack real quick—once done, we never touch this again.
        </p>

        <div className="space-y-4">
          {/* GitHub — icon only */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Github size={20} className="text-gray-300 shrink-0" />
              <span className="text-sm text-white">GitHub</span>
            </div>
            {services.github ? (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <Check size={14} /> Connected
              </span>
            ) : (
              <button
                onClick={handleConnectGitHub}
                className="px-2 py-1 bg-[#333] hover:bg-[#444] text-white text-xs rounded transition-colors"
              >
                Connect
              </button>
            )}
          </div>

          {/* Stripe */}
          <div className="bg-sidebar-bg border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <CreditCard size={24} className="text-gray-300" />
                <div>
                  <div className="text-sm font-medium text-white">Stripe</div>
                  <div className="text-xs text-gray-500">Payments & billing</div>
                </div>
              </div>
              {services.stripe ? (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <Check size={14} /> Connected
                </span>
              ) : null}
            </div>
            {!services.stripe && (
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); handleSaveStripe(); }}>
                <input
                  type="password"
                  placeholder="Secret key (sk_...)"
                  value={stripeKey}
                  onChange={(e) => setStripeKeyState(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-[#333] rounded text-sm text-white placeholder-gray-500 focus:border-primary outline-none"
                />
                <button
                  type="submit"
                  disabled={!stripeKey.trim()}
                  className="px-3 py-1.5 bg-[#333] hover:bg-[#444] disabled:opacity-50 text-white text-sm rounded transition-colors"
                >
                  Connect
                </button>
              </form>
            )}
          </div>

          {/* Custom Domain */}
          <div className="bg-sidebar-bg border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-white">Add Custom (optional)</div>
              {services.domainVerified ? (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <Check size={14} /> Verified
                </span>
              ) : (
                <button
                  onClick={handleVerifyDomain}
                  className="text-xs text-blue-400 hover:underline"
                >
                  Check verification
                </button>
              )}
            </div>
            <div className="text-xs text-gray-500 mb-2">Add these at your DNS provider:</div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 px-2 py-1.5 bg-background rounded text-gray-300 text-xs">
                  A @ {VERCEL_DNS.A}
                </code>
                <button
                  onClick={() => copyDns("A")}
                  className="p-1.5 rounded hover:bg-[#37373d] text-gray-400 hover:text-white"
                  title="Copy"
                >
                  {copied === "A" ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-2 py-1.5 bg-background rounded text-gray-300 text-xs">
                  CNAME www {VERCEL_DNS.CNAME}
                </code>
                <button
                  onClick={() => copyDns("CNAME")}
                  className="p-1.5 rounded hover:bg-[#37373d] text-gray-400 hover:text-white"
                  title="Copy"
                >
                  {copied === "CNAME" ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            <div className="mt-2 flex gap-3 text-xs">
              <a href={GODADDY} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                GoDaddy
              </a>
              <a href={CLOUDFLARE} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                Cloudflare
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          {allGreen ? (
            <button
              onClick={handleDone}
              className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors"
            >
              {isTweaks ? "Save and close" : "Done! Go build"}
            </button>
          ) : (
            <>
              <button
                onClick={handleDone}
                className="w-full py-3 bg-[#333] hover:bg-[#444] text-white font-medium rounded-lg transition-colors"
              >
                {isTweaks ? "Save and close" : "Skip?"}
              </button>
              {!isTweaks && (
                <p className="text-xs text-gray-500 text-center">
                  We'll remind once—better do it now?
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
