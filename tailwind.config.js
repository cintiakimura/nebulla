/** Blue theme: #06061F background, white text, #007ACC strong blue accent. */
export default {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#007ACC",
        secondary: "#007ACC",
        background: "#06061F",
        "editor-bg": "#06061F",
        "sidebar-bg": "#06061F",
        text: "#ffffff",
        muted: "#569cd6",
        // Near page bg so dividers read as subtle separation, not a bright “white” line
        border: "#0B0B2A",
        abyss: {
          bg: "#06061F",
          "editor-bg": "#06061F",
          text: "#ffffff",
          accent: "#007ACC",
          "accent-hover": "#1a8ad4",
          secondary: "#007ACC",
          muted: "#569cd6",
          border: "#0B0B2A",
          hover: "#0B0B2A",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
};
