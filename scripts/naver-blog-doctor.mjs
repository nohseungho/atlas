import { getNaverAutomationDoctor } from "../lib/atlas/naver-browser-publisher.js";

const result = getNaverAutomationDoctor();
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
