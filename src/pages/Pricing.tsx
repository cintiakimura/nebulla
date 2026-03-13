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
    <div className="min-h-screen bg-[#0a0a0a] text-gray-300 font-sans selection:bg-blue-500/30 p-6">
      <nav className="max-w-6xl mx-auto flex items-center justify-between mb-20">
        <button
          onClick={() => navigate("/")}
          className="text-gray-500 hover:text-white flex items-center gap-2 transition-colors"
        >
          <ArrowLeft size={20} />
          Back to Home
        </button>
        <div className="text-2xl font-bold text-white tracking-tighter">kyn.</div>
      </nav>

      <main className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
          Simple, transparent pricing
        </h1>
        <p className="text-xl text-gray-400 mb-16">
          Start for free, upgrade when you need more power.
        </p>

        <div className="grid md:grid-cols-2 gap-8 text-left">
          {/* Free */}
          <div className="p-8 bg-[#111] border border-[#222] rounded-2xl">
            <h3 className="text-2xl font-semibold text-white mb-2">Free</h3>
            <p className="text-gray-400 mb-6">Perfect for trying kyn.</p>
            <div className="text-4xl font-bold text-white mb-8">€0<span className="text-lg text-gray-500 font-normal">/mo</span></div>
            <ul className="space-y-4 mb-8 text-gray-300">
              <li className="flex items-center gap-2">✓ 3 projects</li>
              <li className="flex items-center gap-2">✓ 10 Grok chats per day</li>
              <li className="flex items-center gap-2">✓ Community support</li>
            </ul>
            <button onClick={() => navigate("/login")} className="w-full py-3 bg-[#222] hover:bg-[#333] text-white rounded-lg font-medium transition-colors">
              Get Started
            </button>
          </div>

          {/* Pro */}
          <div className="p-8 bg-gradient-to-b from-[#1a1a2e] to-[#111] border border-blue-500/30 rounded-2xl relative shadow-2xl shadow-blue-900/20">
            <div className="absolute top-0 right-8 transform -translate-y-1/2 bg-blue-500 text-white px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider">
              Most Popular
            </div>
            <h3 className="text-2xl font-semibold text-white mb-2">Pro</h3>
            <p className="text-blue-200/70 mb-6">Unlimited everything.</p>
            <div className="text-4xl font-bold text-white mb-8">Pro<span className="text-lg text-gray-500 font-normal"> — contact for pricing</span></div>
            <ul className="space-y-4 mb-8 text-gray-300">
              <li className="flex items-center gap-2">✓ Unlimited projects</li>
              <li className="flex items-center gap-2">✓ Unlimited Grok chats</li>
              <li className="flex items-center gap-2">✓ Export zip (code + keys)</li>
              <li className="flex items-center gap-2">✓ GitHub export & custom domains</li>
              <li className="flex items-center gap-2">✓ In-app edits & integrations</li>
            </ul>
            <button onClick={handleSubscribe} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
              Upgrade to Pro
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
