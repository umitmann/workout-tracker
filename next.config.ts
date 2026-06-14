import type { NextConfig } from "next";
import { execSync } from "child_process";

function getCommitSha(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  env: {
    COMMIT_SHA: getCommitSha(),
  },
};

export default nextConfig;
