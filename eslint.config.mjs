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
  {
    // Pages and route handlers go through src/features (docs/02-architecture.md §2.2).
    // The auth email-link route is the one exception: it is the session plumbing itself.
    files: ["src/app/**/*.{ts,tsx}"],
    ignores: ["src/app/auth/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/data/*"],
              message: "Routes read and write through src/features (queries.ts / actions.ts), not the data layer.",
            },
          ],
        },
      ],
    },
  },
  {
    // Features orchestrate; they never render UI.
    files: ["src/features/**/*.{ts,tsx}", "src/data/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ group: ["@/app/*", "@/components/*"], message: "Data and feature code must not depend on UI." }],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".tmp/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
