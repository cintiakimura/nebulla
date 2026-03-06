import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Github,
  Database,
  Globe,
  CreditCard,
  Copy,
  Check,
  Trash2,
  Plus,
  ArrowLeft,
} from "lucide-react";
import {
  getConnectedServices,
  setConnectedService,
  getSupabaseCreds,
  setSupabaseCreds,
  getStripeKey,
  setStripeKey,
  getSecrets,
  setSecret,
  removeSecret,
  setDomainVerified,
} from "../lib/setupStorage";

const VERCEL_DNS = { A: "76.76.21.21", CNAME: "cname.vercel-dns.com" };
const SUPABASE_SIGNUP = "https://supabase.com/dashboard";
const GODADDY = "https://www.godaddy.com/domains";
const CLOUDFLARE = "https://dash.cloudflare.com";

export default function Settings() {
  const navigate = useNavigate();
  const [services, setServices] = useState(getConnectedServices());
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseAnonKey, setSupabaseAnonKey] = useState("");
  const [stripeKey, setStripeKeyState] = useState("");
  const [secrets, setSecretsState] = useState<Record<string, string>>({});
  const [newSecretKey, setNewSecretKey] = useState("");
  const [newSecretValue, setNewSecretValue] = useState("");
  const [secretError, setSecretError] = useState("");
  const [copied, setCopied] = useState<"A" | "CNAME" | null>(null);

  useEffect(() => {
    const creds = getSupabaseCreds();
    if (creds) {
      setSupabaseUrl(creds.url);
      setSupabaseAnonKey(creds.anonKey);
    }
    setStripeKeyState(getStripeKey());
    setSecretsState(getSecrets());
  }, []);

  const refreshServices = () => setServices(getConnectedServices());

  const saveSupabase = () => {
    if (supabaseUrl.trim() && supabaseAnonKey.trim()) {
      setSupabaseCreds(supabaseUrl, supabaseAnonKey);
      setConnectedService("supabase", true);
      refreshServices();
    }
  };

  const saveStripe = () => {
    setStripeKey(stripeKey);
    refreshServices();
  };

  const addSecret = () => {
    const k = newSecretKey.trim();
    if (!k) {
      setSecretError("Key is required");
      return;
    }
    if (Object.prototype.hasOwnProperty.call(secrets, k)) {
      setSecretError("Key already exists");
      return;
    }
    setSecret(k, newSecretValue.trim());
    setSecretsState(getSecrets());
    setNewSecretKey("");
    setNewSecretValue("");
    setSecretError("");
  };

  const copyDns = (type: "A" | "CNAME") => {
    const value = type === "A" ? VERCEL_DNS.A : VERCEL_DNS.CNAME;
    navigator.clipboard.writeText(value);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-gray-300 font-sans">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <h1 className="text-2xl font-semibold text-white mb-6">Settings</h1>

        <div className="space-y-4">
            {/* GitHub */}
            <div className="bg-[#252526] border border-[#333333] rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Github size={24} className="text-gray-300" />
                <div>
                  <div className="text-sm font-medium text-white">GitHub</div>
                  <div className="text-xs text-gray-500">Repos, deploy hooks</div>
                </div>
              </div>
              {services.github ? (
                <span className="flex items-center gap-1 text-xs text-green-400"><Check size={14} /> Connected</span>
              ) : (
                <button onClick={() => { setConnectedService("github", true); refreshServices(); }} className="px-3 py-1.5 bg-[#333] hover:bg-[#444] text-white text-sm rounded">Connect</button>
              )}
            </div>

            {/* Supabase */}
            <div className="bg-[#252526] border border-[#333333] rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <Database size={24} className="text-gray-300" />
                <div>
                  <div className="text-sm font-medium text-white">Supabase</div>
                  <div className="text-xs text-gray-500">DB + auth</div>
                </div>
              </div>
              <a href={SUPABASE_SIGNUP} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline mb-2 inline-block">Dashboard</a>
              <div className="space-y-2">
                <input type="url" placeholder="Project URL" value={supabaseUrl} onChange={(e) => setSupabaseUrl(e.target.value)} className="w-full px-3 py-2 bg-[#1e1e1e] border border-[#333] rounded text-sm text-white placeholder-gray-500 focus:border-blue-500 outline-none" />
                <input type="password" placeholder="Anon key" value={supabaseAnonKey} onChange={(e) => setSupabaseAnonKey(e.target.value)} className="w-full px-3 py-2 bg-[#1e1e1e] border border-[#333] rounded text-sm text-white placeholder-gray-500 focus:border-blue-500 outline-none" />
                <button onClick={saveSupabase} disabled={!supabaseUrl.trim() || !supabaseAnonKey.trim()} className="px-3 py-1.5 bg-[#333] hover:bg-[#444] disabled:opacity-50 text-white text-sm rounded">Save</button>
              </div>
            </div>

            {/* Vercel */}
            <div className="bg-[#252526] border border-[#333333] rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe size={24} className="text-gray-300" />
                <div>
                  <div className="text-sm font-medium text-white">Vercel</div>
                  <div className="text-xs text-gray-500">Deploy & hosting</div>
                </div>
              </div>
              {services.vercel ? (
                <span className="flex items-center gap-1 text-xs text-green-400"><Check size={14} /> Connected</span>
              ) : (
                <button onClick={() => { setConnectedService("vercel", true); refreshServices(); }} className="px-3 py-1.5 bg-[#333] hover:bg-[#444] text-white text-sm rounded">Connect</button>
              )}
            </div>

            {/* Stripe */}
            <div className="bg-[#252526] border border-[#333333] rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <CreditCard size={24} className="text-gray-300" />
                <div>
                  <div className="text-sm font-medium text-white">Stripe</div>
                  <div className="text-xs text-gray-500">Payments, OAuth or secret key</div>
                </div>
              </div>
              <input type="password" placeholder="Secret key (sk_...)" value={stripeKey} onChange={(e) => setStripeKeyState(e.target.value)} className="w-full px-3 py-2 bg-[#1e1e1e] border border-[#333] rounded text-sm text-white placeholder-gray-500 focus:border-blue-500 outline-none mb-2" />
              <button onClick={saveStripe} className="px-3 py-1.5 bg-[#333] hover:bg-[#444] text-white text-sm rounded">Save</button>
            </div>

            {/* DNS */}
            <div className="bg-[#252526] border border-[#333333] rounded-lg p-4">
              <div className="text-sm font-medium text-white mb-2">DNS (Vercel)</div>
              <div className="text-xs text-gray-500 mb-2">A @ {VERCEL_DNS.A} · CNAME www {VERCEL_DNS.CNAME}</div>
              <div className="flex gap-2">
                <button onClick={() => copyDns("A")} className="px-2 py-1.5 bg-[#333] hover:bg-[#444] text-white text-xs rounded flex items-center gap-1">{copied === "A" ? <Check size={12} /> : <Copy size={12} />} Copy A</button>
                <button onClick={() => copyDns("CNAME")} className="px-2 py-1.5 bg-[#333] hover:bg-[#444] text-white text-xs rounded flex items-center gap-1">{copied === "CNAME" ? <Check size={12} /> : <Copy size={12} />} Copy CNAME</button>
              </div>
              <div className="mt-2 flex gap-3 text-xs">
                <a href={GODADDY} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">GoDaddy</a>
                <a href={CLOUDFLARE} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Cloudflare</a>
              </div>
              <button onClick={() => { setDomainVerified(true); refreshServices(); }} className="mt-2 text-xs text-blue-400 hover:underline">Mark verified</button>
            </div>

            {/* Secrets */}
            <div className="bg-[#252526] border border-[#333333] rounded-lg p-4">
              <div className="text-sm font-medium text-white mb-2">Secrets</div>
              <p className="text-xs text-gray-500 mb-3">Key-value pairs. No duplicate keys.</p>
              <div className="space-y-2 mb-3">
                {Object.entries(secrets).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="flex-1 px-2 py-1.5 bg-[#1e1e1e] rounded text-xs text-gray-300 font-mono truncate">{k}</span>
                    <span className="flex-1 px-2 py-1.5 bg-[#1e1e1e] rounded text-xs text-gray-500 truncate">•••</span>
                    <button onClick={() => { removeSecret(k); setSecretsState(getSecrets()); }} className="p-1.5 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400" title="Remove"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <input type="text" placeholder="Key" value={newSecretKey} onChange={(e) => { setNewSecretKey(e.target.value); setSecretError(""); }} className="w-32 px-2 py-1.5 bg-[#1e1e1e] border border-[#333] rounded text-xs text-white placeholder-gray-500 focus:border-blue-500 outline-none" />
                <input type="password" placeholder="Value" value={newSecretValue} onChange={(e) => setNewSecretValue(e.target.value)} className="w-32 px-2 py-1.5 bg-[#1e1e1e] border border-[#333] rounded text-xs text-white placeholder-gray-500 focus:border-blue-500 outline-none" />
                <button onClick={addSecret} className="p-1.5 rounded bg-[#333] hover:bg-[#444] text-white flex items-center gap-1"><Plus size={14} /> Add</button>
              </div>
              {secretError && <p className="text-xs text-red-400 mt-1">{secretError}</p>}
            </div>
        </div>
      </div>
    </div>
  );
}
