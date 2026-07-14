import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Playwright reports contain bundled third-party JavaScript and
    // must not be treated as application source during full-repo lint runs.
    "test-results/**",
    "playwright-report/**",
    // Agent worktrees (full repo checkouts) — never lint them.
    ".claude/worktrees/**",
  ]),
  {
    // Pre-existing `any` debt (untyped Supabase query results), predates the
    // 2026-07 quality survey. Downgraded to warnings so CI can gate on NEW
    // violations elsewhere; burn this list down file by file, don't extend it.
    // Note: `[id]` segments are written as `*` because [] is a minimatch
    // character class and would never match the literal directory name.
    files: [
      "src/lib/dal.ts",
      "src/app/dashboard/page.tsx",
      "src/app/routines/*/ExerciseDetailClient.tsx",
      "src/app/workout/*/ExerciseInfoModal.tsx",
      "src/app/workout/*/page.tsx",
      "src/app/workouts/CalendarView.tsx",
      "src/app/workouts/*/page.tsx",
      "src/app/workouts/new/page.tsx",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
]);

export default eslintConfig;
