/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        mist: "#eef2ff",
        sky: "#c4f1f9",
        ember: "#ff7a59",
        gold: "#f6b93b",
      },
      boxShadow: {
        panel: "0 24px 80px rgba(15, 23, 42, 0.12)",
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at top left, rgba(255,255,255,0.9), transparent 32%), linear-gradient(120deg, rgba(255,255,255,0.24), rgba(255,255,255,0))",
      },
    },
  },
  plugins: [],
};
