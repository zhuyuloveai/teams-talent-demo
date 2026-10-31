// Build finish step: copy the hand-written type declarations to the package entry dist/trace-monitor-vue.d.ts
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
copyFileSync(
  resolve(root, "src/types/trace-monitor-vue.d.ts"),
  resolve(root, "dist/trace-monitor-vue.d.ts"),
);
console.log("types copied -> dist/trace-monitor-vue.d.ts");
