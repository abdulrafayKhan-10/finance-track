import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // The financial domain is pure TypeScript (docs/02-architecture.md §2.2).
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react/*", "next", "next/*"],
              message: "Domain code must not depend on React or Next.js.",
            },
            {
              group: ["@supabase/*", "@/data/*", "@/app/*", "@/components/*", "@/features/*"],
              message: "Domain code must not depend on data access or UI.",
            },
          ],
        },
      ],
    },
  },
  {
    // Privileged / server-side modules may only be imported from server code.
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/data/*", "@/lib/env/server"],
              message: "Components receive data via props or server actions.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".tmp/**", "coverage/**"]),
]);

export default eslintConfig;
