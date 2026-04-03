import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { analyzeProjectSchema, handleAnalyzeProject } from './tools/analyze-project.js';
import { analyzeGitSchema, handleAnalyzeGit } from './tools/analyze-git.js';
import { analyzeCodeSchema, handleAnalyzeCode } from './tools/analyze-code.js';
import { generateReportSchema, handleGenerateReport } from './tools/generate-report.js';
import { logProblemSchema, handleLogProblem } from './tools/log-problem.js';
import { resolveProblemSchema, handleResolveProblem } from './tools/resolve-problem.js';
import { listOpportunitiesSchema, handleListOpportunities } from './tools/list-opportunities.js';
import { portfolioInsightSchema, handlePortfolioInsight } from './tools/portfolio-insight.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'portfolio-tracker',
    version: '0.1.0',
  });

  server.tool(
    'analyze_project',
    'Scan project structure, detect tech stack, and collect statistics',
    analyzeProjectSchema.shape,
    async (args) => handleAnalyzeProject(analyzeProjectSchema.parse(args)),
  );

  server.tool(
    'analyze_git',
    'Analyze git history to find development stories (troubleshooting, refactoring, architecture changes)',
    analyzeGitSchema.shape,
    async (args) => handleAnalyzeGit(analyzeGitSchema.parse(args)),
  );

  server.tool(
    'analyze_code',
    'Java/Kotlin Spring Boot 코드 품질 분석 및 포트폴리오 가치 높은 개선 기회 감지',
    analyzeCodeSchema.shape,
    async (args) => handleAnalyzeCode(analyzeCodeSchema.parse(args)),
  );

  server.tool(
    'generate_report',
    'Generate a comprehensive portfolio report with LLM-powered narrative',
    generateReportSchema.shape,
    async (args) => handleGenerateReport(generateReportSchema.parse(args)),
  );

  server.tool(
    'log_problem',
    'Log a problem encountered during development for portfolio tracking',
    logProblemSchema.shape,
    async (args) => handleLogProblem(logProblemSchema.parse(args)),
  );

  server.tool(
    'resolve_problem',
    'Mark a logged problem as resolved with the solution description',
    resolveProblemSchema.shape,
    async (args) => handleResolveProblem(resolveProblemSchema.parse(args)),
  );

  server.tool(
    'list_opportunities',
    'List ranked code improvement opportunities sorted by portfolio value',
    listOpportunitiesSchema.shape,
    async (args) => handleListOpportunities(listOpportunitiesSchema.parse(args)),
  );

  server.tool(
    'portfolio_insight',
    'Spring Boot 포트폴리오 종합 분석: 강점 발견, Git에서 경험 발굴, 개선 기회 탐색, 성숙도 점수(0-100)',
    portfolioInsightSchema.shape,
    async (args) => handlePortfolioInsight(portfolioInsightSchema.parse(args)),
  );

  return server;
}
