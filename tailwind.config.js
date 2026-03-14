/** Dark blue theme: #1A1A2B background, white text, #007ACC strong blue accent. */
export default {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#007ACC",
        secondary: "#007ACC",
        background: "#1A1A2B",
        "editor-bg": "#1e1e32",
        "sidebar-bg": "#252538",
        text: "#ffffff",
        muted: "#9ca3af",
        border: "#2d3f4f",
        abyss: {
          bg: "#1A1A2B",
          "editor-bg": "#1e1e32",
          text: "#ffffff",
          accent: "#007ACC",
          "accent-hover": "#1a8ad4",
          secondary: "#007ACC",
          muted: "#9ca3af",
          border: "#2d3f4f",
          hover: "#2B3040",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
};
