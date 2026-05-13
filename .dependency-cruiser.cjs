module.exports = {
  forbidden: [
    {
      name: "no-cross-bc-imports",
      severity: "error",
      comment: "BC 간 직접 import 금지 — 같은 BC 안에서만 import 허용",
      from: { path: "^src/bounded-contexts/([^/]+)" },
      to: {
        path: "^src/bounded-contexts/([^/]+)",
        pathNot: "^src/bounded-contexts/$1",
      },
    },
    {
      name: "domain-cannot-know-infrastructure",
      severity: "error",
      comment: "Hexagonal: domain layer는 infrastructure를 모른다",
      from: { path: "src/bounded-contexts/[^/]+/domain" },
      to: { path: "^src/infrastructure" },
    },
    {
      name: "domain-cannot-know-nestjs",
      severity: "error",
      comment: "Effect 도입 후 강조: domain은 @nestjs/*를 import하지 않는다",
      from: { path: "src/bounded-contexts/[^/]+/domain" },
      to: { path: "^@nestjs" },
    },
    {
      name: "shared-kernel-purity",
      severity: "error",
      comment:
        "shared-kernel은 BC나 infrastructure를 알면 안 된다 (effect는 허용)",
      from: { path: "^src/shared-kernel" },
      to: {
        pathNot: "^src/shared-kernel|^node_modules",
      },
    },
    {
      name: "infrastructure-cannot-import-bc",
      severity: "error",
      comment: "infrastructure는 특정 BC를 모른다 (역의존성)",
      from: { path: "^src/infrastructure" },
      to: { path: "^src/bounded-contexts" },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: "순환 의존성 금지",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
