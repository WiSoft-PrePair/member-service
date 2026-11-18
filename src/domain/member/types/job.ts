// 선택할 수 있는 직무 코드 (interview-service의 Job enum, web의 jobs.ts와 같은 목록)
export const JOBS = [
  "BACKEND",
  "FRONTEND",
  "FULLSTACK",
  "ANDROID",
  "IOS",
  "CROSS_PLATFORM",
  "GAME_CLIENT",
  "GAME_SERVER",
  "AI_ML",
  "DATA_ENGINEER",
  "DEVOPS",
  "SECURITY",
  "DBA",
  "EMBEDDED",
  "QA",
] as const;

export type Job = (typeof JOBS)[number];
