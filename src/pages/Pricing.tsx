import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { getUserId } from "../lib/auth";
import { getApiBase } from "../lib/api";

export default function Pricing() {
  const navigate = useNavigate();

  const handleSubscribe = async () => {
    try {
      const userId = await getUserId();
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase || ""}/api/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro", userId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? "Checkout didn’t complete. Try again.");
      }
    } catch (_) {
      alert("Checkout didn’t complete. Try again.");
    }
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-[#d4d4d4] font-sans selection:bg-[#007acc]/30 p-6">
      <nav className="max-w-6xl mx-auto flex items-center justify-between mb-20">
        <button
          onClick={() => navigate("/")}
          className="text-[#9ca3af] hover:text-[#9cdcfe] flex items-center gap-2 transition-colors"
        >
          <ArrowLeft size={20} />
          Back to Home
        </button>
        <div className="text-2xl font-bold text-[#9cdcfe] tracking-tighter">kyn.</div>
      </nav>

      <main className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
          Simple, transparent pricing
        </h1>
        <p className="text-xl text-[#9ca3af] mb-16">
          Start for free, upgrade when you need more power.
        </p>

        <div className="grid md:grid-cols-2 gap-8 text-left">
          <div className="p-8 bg-[#252526] border border-[#2d3f4f] rounded-2xl">
            <h3 className="text-2xl font-semibold text-[#9cdcfe] mb-2">Free</h3>
            <p className="text-[#9ca3af] mb-6">Perfect for trying kyn.</p>
            <div className="text-4xl font-bold text-white mb-8">€0<span className="text-lg text-[#9ca3af] font-normal">/mo</span></div>
            <ul className="space-y-4 mb-8 text-[#d4d4d4]">
              <li className="flex items-center gap-2">✓ 3 projects</li>
              <li className="flex items-center gap-2">✓ 10 Grok chats per day</li>
              <li className="flex items-center gap-2">✓ Community support</li>
            </ul>
            <button onClick={() => navigate("/login")} className="w-full py-3 bg-[#007acc] hover:bg-[#1a8ad4] text-white rounded-lg font-medium transition-colors">
              Get Started
            </button>
          </div>

          <div className="p-8 bg-[#252526] border border-[#007acc]/50 rounded-2xl relative shadow-2xl shadow-[#007acc]/10">
            <div className="absolute top-0 right-8 transform -translate-y-1/2 bg-[#007acc] text-white px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider">
              Most Popular
            </div>
            <h3 className="text-2xl font-semibold text-[#9cdcfe] mb-2">Pro</h3>
            <p className="text-[#9ca3af] mb-6">Unlimited everything.</p>
            <div className="text-4xl font-bold text-white mb-8">Pro<span className="text-lg text-[#9ca3af] font-normal"> — contact for pricing</span></div>
            <ul className="space-y-4 mb-8 text-[#d4d4d4]">
              <li className="flex items-center gap-2">✓ Unlimited projects</li>
              <li className="flex items-center gap-2">✓ Unlimited Grok chats</li>
              <li className="flex items-center gap-2">✓ Export zip (code + keys)</li>
              <li className="flex items-center gap-2">✓ GitHub export & custom domains</li>
              <li className="flex items-center gap-2">✓ In-app edits & integrations</li>
            </ul>
            <button onClick={handleSubscribe} className="w-full py-3 bg-[#007acc] hover:bg-[#1a8ad4] text-white rounded-lg font-medium transition-colors">
              Upgrade to Pro
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
