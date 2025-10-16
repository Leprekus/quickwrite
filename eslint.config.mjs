import eslintConfigNext from "eslint-config-next";

export default [
  ...eslintConfigNext(),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];
