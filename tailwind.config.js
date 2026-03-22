/** Celestial Fluidity — midnight surface, cyan–violet luminescence (see src/index.css). */
export default {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#00e6e6",
        secondary: "#a533ff",
        background: "#040f1a",
        "editor-bg": "#051422",
        "sidebar-bg": "#0b2134",
        text: "#c8d9e8",
        muted: "#7a9aad",
        border: "rgba(51, 74, 97, 0.14)",
        abyss: {
          bg: "#040f1a",
          "editor-bg": "#051422",
          text: "#c8d9e8",
          accent: "#00e6e6",
          "accent-hover": "#33eeea",
          secondary: "#c1fffe",
          muted: "#7a9aad",
          border: "rgba(51, 74, 97, 0.14)",
          hover: "#0b2134",
        },
      },
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Manrope", "ui-sans-serif", "sans-serif"],
      },
      borderRadius: {
        celestial: "1.5rem",
        "celestial-xl": "3rem",
      },
      boxShadow: {
        nebula: "0 24px 48px -12px rgba(96, 0, 159, 0.05)",
        pulsar: "0 0 20px rgba(193, 255, 254, 0.3)",
      },
    },
  },
};
