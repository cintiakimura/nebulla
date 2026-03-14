/** Abyss theme: #0F172A background, #E0E0E0 text, #00BFFF accent, #FF6B6B secondary. No purple. */
export default {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#00BFFF",
        secondary: "#FF6B6B",
        background: "#0F172A",
        text: "#E0E0E0",
        abyss: {
          bg: "#0F172A",
          text: "#E0E0E0",
          accent: "#00BFFF",
          "accent-hover": "#40d4ff",
          secondary: "#FF6B6B",
          muted: "#9ca3af",
          border: "#1e293b",
          hover: "#1e293b",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
};
