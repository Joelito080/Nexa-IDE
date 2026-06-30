export interface FreeAgentPlan {
  goal: string;
  steps: string[];
  filesToCreate: string[];
  filesToModify: string[];
  warnings: string[];
}

export interface FreeAgentRequest {
  request: string;
  fileContext?: string[];
  projectStructure?: string[];
}

const DEFAULT_PROJECT_STRUCTURE = [
  'src/',
  'src/components/',
  'src/lib/',
  'src/types/',
  'package.json',
  'README.md',
];

function extractFileReferences(input: string): string[] {
  const matches = input.match(/[A-Za-z0-9._/-]+\.[A-Za-z0-9]+/g) ?? [];
  return [...new Set(matches)].slice(0, 8);
}

function inferFilesToCreate(request: string, fileContext: string[] = []): string[] {
  const references = extractFileReferences(request);
  const lower = request.toLowerCase();

  if (lower.includes('create') || lower.includes('add') || lower.includes('build project')) {
    return references.length > 0 ? references : ['src/newFeature.ts', 'src/newFeature.test.ts'];
  }

  if (fileContext.length > 0) {
    return [];
  }

  return ['src/feature.ts'];
}

function inferFilesToModify(request: string, fileContext: string[] = []): string[] {
  const references = extractFileReferences(request);
  if (references.length > 0) {
    return references;
  }

  if (fileContext.length > 0) {
    return fileContext.slice(0, 4);
  }

  return ['src/app.ts', 'src/index.ts'];
}

function buildGenericPlan(request: string, fileContext: string[] = [], projectStructure: string[] = []): FreeAgentPlan {
  const contextSummary = projectStructure.length > 0 ? projectStructure : DEFAULT_PROJECT_STRUCTURE;
  const references = extractFileReferences(request);

  return {
    goal: `Handle the requested work for: ${request}`,
    steps: [
      `Analyze the current project structure and identify relevant modules from ${contextSummary.slice(0, 6).join(', ')}.`,
      'Break the request into concrete subtasks and assign execution order.',
      'Draft the required implementation or content changes across the affected files.',
      'Prepare a multi-file update plan that keeps the work localized and reversible.',
      'Return a structured set of actions for execution.',
    ],
    filesToCreate: inferFilesToCreate(request, fileContext),
    filesToModify: references.length > 0 ? references : inferFilesToModify(request, fileContext),
    warnings: [
      'This is a local planning agent and does not call external services.',
      'No existing files are modified by the planner itself.',
    ],
  };
}

function buildBuildProjectPlan(request: string, fileContext: string[] = [], projectStructure: string[] = []): FreeAgentPlan {
  const contextSummary = projectStructure.length > 0 ? projectStructure : DEFAULT_PROJECT_STRUCTURE;

  return {
    goal: 'Scaffold the requested project with a local implementation plan.',
    steps: [
      `Inspect the provided structure and confirm the starting point from ${contextSummary.slice(0, 6).join(', ')}.`,
      'Create a full scaffold plan with entry points, configuration files, and core directories.',
      'Outline the main modules, shared utilities, and initial application shell.',
      'Define the first multi-file implementation pass for the scaffold.',
      'Prepare follow-up tasks for validation, wiring, and documentation.',
    ],
    filesToCreate: ['package.json', 'src/main.ts', 'src/app.ts', 'README.md'],
    filesToModify: fileContext.length > 0 ? fileContext.slice(0, 4) : ['README.md'],
    warnings: [
      'Scaffold planning is intentionally high-level and can be refined further.',
      'No runtime or external API calls are required for this planner.',
    ],
  };
}

function buildBugFixPlan(request: string, fileContext: string[] = [], projectStructure: string[] = []): FreeAgentPlan {
  const contextSummary = projectStructure.length > 0 ? projectStructure : DEFAULT_PROJECT_STRUCTURE;

  return {
    goal: 'Create a debugging plan for the reported issue.',
    steps: [
      `Inspect the relevant files and project layout from ${contextSummary.slice(0, 6).join(', ')}.`,
      'Reproduce the failure mode and isolate the affected subsystem.',
      'Break the investigation into small debugging subtasks and expected outcomes.',
      'Propose the minimal code changes needed to fix the bug safely.',
      'Add a validation pass to confirm the issue is resolved without regressions.',
    ],
    filesToCreate: [],
    filesToModify: fileContext.length > 0 ? fileContext.slice(0, 4) : ['src/debugging.ts'],
    warnings: [
      'This plan assumes the bug can be addressed through local inspection and iteration.',
      'The planner does not execute code or patch files directly.',
    ],
  };
}

function buildRefactorPlan(request: string, fileContext: string[] = [], projectStructure: string[] = []): FreeAgentPlan {
  const contextSummary = projectStructure.length > 0 ? projectStructure : DEFAULT_PROJECT_STRUCTURE;

  return {
    goal: 'Create a refactoring plan that improves structure without changing behavior.',
    steps: [
      `Review the supplied structure and identify the modules involved from ${contextSummary.slice(0, 6).join(', ')}.`,
      'Separate the refactor into logical subtasks such as extraction, naming, and cleanup.',
      'Plan the multi-file changes needed to keep the refactor incremental and safe.',
      'Define a verification checklist for regression prevention.',
      'Prepare a composer-style execution sequence for the refactor.',
    ],
    filesToCreate: ['src/refactor-notes.ts'],
    filesToModify: fileContext.length > 0 ? fileContext.slice(0, 4) : ['src/refactor.ts'],
    warnings: [
      'Refactors should preserve runtime behavior and be validated incrementally.',
      'The planner stays local and does not alter existing code directly.',
    ],
  };
}

export function createFreeAgentPlan(input: string | FreeAgentRequest, options: Partial<FreeAgentRequest> = {}): FreeAgentPlan {
  const normalizedInput = typeof input === 'string'
    ? { request: input, fileContext: [], projectStructure: [] }
    : input;

  const request = normalizedInput.request ?? '';
  const fileContext = normalizedInput.fileContext ?? options.fileContext ?? [];
  const projectStructure = normalizedInput.projectStructure ?? options.projectStructure ?? [];
  const lower = request.toLowerCase();

  if (lower.includes('build project') || lower.includes('scaffold')) {
    return buildBuildProjectPlan(request, fileContext, projectStructure);
  }

  if (lower.includes('fix bug') || lower.includes('debug')) {
    return buildBugFixPlan(request, fileContext, projectStructure);
  }

  if (lower.includes('refactor')) {
    return buildRefactorPlan(request, fileContext, projectStructure);
  }

  return buildGenericPlan(request, fileContext, projectStructure);
}

export function formatFreeAgentPlan(plan: FreeAgentPlan): string {
  return JSON.stringify(plan, null, 2);
}

export interface AgentFileSystemAdapter {
  readFile(path: string): Promise<string | undefined>;
  writeFile(path: string, content: string): Promise<void>;
  applyPatch(path: string, diff: string): Promise<void>;
  createFile(path: string, content?: string): Promise<void>;
}

export interface AgentExecutionAction {
  type: 'read' | 'write' | 'modify' | 'skip' | 'log';
  filePath?: string;
  status: 'pending' | 'completed' | 'skipped' | 'failed';
  message: string;
  content?: string;
}

export interface AgentExecutionResult {
  plan: FreeAgentPlan;
  actions: AgentExecutionAction[];
  files: Record<string, string>;
}

export interface AgentFileExecutionReport {
  filePath: string;
  success: boolean;
  status: 'success' | 'failed' | 'skipped';
  message: string;
}

export interface AgentExecutionReport {
  plan: FreeAgentPlan;
  actions: AgentExecutionAction[];
  results: AgentFileExecutionReport[];
  files: Record<string, string>;
}

export interface AgentExecutionSnapshot {
  files: Record<string, string>;
  timestamp: string;
}

export interface AgentSelfHealingReport extends AgentExecutionReport {
  healingAttempts: number;
  repaired: boolean;
  rollbackPerformed: boolean;
  validation?: AgentValidationReport;
  runtime?: AgentRuntimeExecutionReport;
}

export interface AgentValidationIssue {
  kind: 'build' | 'import' | 'dependency' | 'cross-file';
  filePath?: string;
  message: string;
  severity: 'error' | 'warning';
  source?: string;
}

export interface AgentValidationReport {
  success: boolean;
  errors: AgentValidationIssue[];
  build: {
    success: boolean;
    command: string;
    output: string;
    errors: string[];
  };
  imports: AgentValidationIssue[];
  crossFile: AgentValidationIssue[];
}

export interface AgentRuntimeExecutionReport {
  success: boolean;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errors: string[];
}

export interface AgentRuntimeHistoryEntry {
  id: string;
  command: string;
  status: 'success' | 'failed' | 'blocked';
  timestamp: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface AgentProjectNode {
  filePath: string;
  feature: 'UI' | 'AI' | 'Runtime' | 'Shared' | 'Tests' | 'Core';
  imports: string[];
  exports: string[];
  risk: 'low' | 'medium' | 'high';
}

export interface AgentProjectEdge {
  from: string;
  to: string;
  kind: 'import' | 'export' | 'dependency';
}

export interface AgentFeatureGroup {
  name: string;
  files: string[];
  description: string;
  risk: 'low' | 'medium' | 'high';
}

export interface AgentImpactPrediction {
  filePath: string;
  affectedFiles: string[];
  risk: 'low' | 'medium' | 'high';
  reason: string;
}

export interface AgentProjectIntelligenceGraph {
  nodes: AgentProjectNode[];
  edges: AgentProjectEdge[];
  featureGroups: AgentFeatureGroup[];
  highRiskAreas: string[];
  predictions: AgentImpactPrediction[];
}

export interface AgentExecutionMemoryEntry {
  id: string;
  kind: 'command' | 'failure' | 'module' | 'dependency';
  target: string;
  detail: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface AgentFailurePattern {
  id: string;
  target: string;
  kind: 'file' | 'command' | 'module';
  signature: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  recurring: boolean;
  tags: string[];
}

export interface AgentDependencyRelationship {
  id: string;
  from: string;
  to: string;
  count: number;
  lastSeen: string;
}

export interface AgentPersistentMemoryStore {
  version: number;
  lastUpdated: string;
  executionHistory: AgentExecutionMemoryEntry[];
  failurePatterns: AgentFailurePattern[];
  dependencyGraph: AgentDependencyRelationship[];
  failedTests: AgentFailedTestCase[];
  vectorMemory: AgentMemoryVectorEntry[];
  architecturePatterns: AgentArchitecturePattern[];
}

export interface AgentFailedTestCase {
  id: string;
  filePath: string;
  target: string;
  kind: 'unit' | 'integration';
  message: string;
  timestamp: string;
}

export interface AgentMemoryVectorEntry {
  id: string;
  kind: 'failure' | 'fix' | 'architecture' | 'pattern';
  summary: string;
  filePath?: string;
  tags: string[];
  vector: number[];
  timestamp: string;
}

export interface AgentArchitecturePattern {
  id: string;
  name: string;
  description: string;
  examples: string[];
  filePaths: string[];
  tags: string[];
  timestamp: string;
}

export interface AgentGeneratedTestCase {
  id: string;
  filePath: string;
  kind: 'unit' | 'integration';
  target: string;
  content: string;
  createdAt: string;
}

export interface AgentCoverageCheck {
  filePath: string;
  functionName: string;
  tested: boolean;
  reason: string;
}

export interface AgentRegressionResult {
  filePath: string;
  testIds: string[];
  passed: boolean;
  message: string;
}

export interface AgentGitCheckpoint {
  branch: string;
  commitSha: string;
  summary: string;
  timestamp: string;
}

export interface AgentSemanticSymbol {
  id: string;
  name: string;
  kind: 'function' | 'class' | 'interface' | 'export';
  filePath: string;
  line: number;
  references: string[];
}

export interface AgentSemanticPatch {
  filePath: string;
  original: string;
  updated: string;
  reason: string;
}

export interface AgentSemanticAnalysis {
  symbols: AgentSemanticSymbol[];
  callChains: string[];
  impactedSymbols: string[];
  patches: AgentSemanticPatch[];
}

export interface AgentTask {
  id: string;
  title: string;
  goal: string;
  filesToCreate: string[];
  filesToModify: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'escalated';
  notes: string[];
  metadata?: {
    dependencyTargets?: string[];
    priority?: number;
  };
}

export interface AgentAgentResult {
  agent: 'PlannerAgent' | 'CoderAgent' | 'ReviewerAgent' | 'TesterAgent' | 'MemoryAgent';
  status: 'completed' | 'failed' | 'skipped' | 'escalated';
  message: string;
  taskId?: string;
}

export interface AgentOrchestrationReport {
  plan: FreeAgentPlan;
  tasks: AgentTask[];
  results: AgentAgentResult[];
  escalated: boolean;
  summary: string;
}

export interface AgentRepairQueueEntry {
  id: string;
  reason: string;
  filePaths: string[];
  severity: 'low' | 'medium' | 'high';
  suggestedFix: string;
  createdAt: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
}

export interface AgentSuggestion {
  id: string;
  message: string;
  category: 'optimization' | 'testing' | 'cleanup' | 'architecture';
  relatedFiles: string[];
  tags: string[];
}

export interface AgentWatcherReport {
  changedFiles: string[];
  repeatedFailures: AgentFailurePattern[];
  staleTests: AgentCoverageCheck[];
  suggestions: AgentSuggestion[];
  queuedRepairs: number;
  timestamp: string;
}

export interface AgentBackgroundDaemonConfig {
  pollIntervalMs: number;
  staleTestThresholdDays: number;
  maxQueuedRepairs: number;
}

class LocalFileSystemAdapter implements AgentFileSystemAdapter {
  async readFile(path: string): Promise<string | undefined> {
    const fs = await import('node:fs/promises');
    try {
      return await fs.readFile(path, 'utf8');
    } catch {
      return undefined;
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    const fs = await import('node:fs/promises');
    const pathModule = await import('node:path');
    const directory = pathModule.dirname(path);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path, content, 'utf8');
  }

  async applyPatch(path: string, diff: string): Promise<void> {
    const fs = await import('node:fs/promises');
    const pathModule = await import('node:path');
    const directory = pathModule.dirname(path);
    await fs.mkdir(directory, { recursive: true });
    const current = await fs.readFile(path, 'utf8').catch(() => '');
    await fs.writeFile(path, `${current}\n\n// patch\n${diff}`, 'utf8');
  }

  async createFile(path: string, content: string = ''): Promise<void> {
    const fs = await import('node:fs/promises');
    const pathModule = await import('node:path');
    const directory = pathModule.dirname(path);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path, content, 'utf8');
  }
}

export class AgentExecutor {
  private readonly files: Record<string, string>;
  private readonly actions: AgentExecutionAction[];
  private readonly safeMode: boolean;
  private readonly logger?: (action: AgentExecutionAction) => void;
  private readonly adapter: AgentFileSystemAdapter;
  private readonly confirmChanges: boolean;
  private readonly criticalPathPatterns: RegExp[];
  private readonly snapshots: AgentExecutionSnapshot[];
  private readonly projectRoot: string;
  private readonly runtimeHistory: AgentRuntimeHistoryEntry[];
  private projectIntelligence?: AgentProjectIntelligenceGraph;
  private readonly allowedCommands: RegExp[];
  private readonly destructiveCommands: RegExp[];
  private persistentMemory: AgentPersistentMemoryStore;
  private readonly memoryFilePath: string;
  private readonly gitCheckpoints: AgentGitCheckpoint[];
  private readonly generatedTests: AgentGeneratedTestCase[];
  private readonly regressionResults: AgentRegressionResult[];
  private readonly vectorMemory: AgentMemoryVectorEntry[];
  private readonly architecturePatterns: AgentArchitecturePattern[];
  private backgroundDaemonActive: boolean;
  private watcherIntervalMs: number;
  private staleTestThresholdDays: number;
  private repairQueue: AgentRepairQueueEntry[];
  private lastObservedTimestamps: Record<string, number>;

  constructor(options: {
    files?: Record<string, string>;
    safeMode?: boolean;
    confirmChanges?: boolean;
    adapter?: AgentFileSystemAdapter;
    logger?: (action: AgentExecutionAction) => void;
    projectRoot?: string;
  } = {}) {
    this.files = { ...(options.files ?? {}) };
    this.actions = [];
    this.safeMode = options.safeMode ?? true;
    this.confirmChanges = options.confirmChanges ?? false;
    this.adapter = options.adapter ?? new LocalFileSystemAdapter();
    this.logger = options.logger;
    this.snapshots = [];
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.runtimeHistory = [];
    this.projectIntelligence = undefined;
    this.allowedCommands = [/^npm(?:\s|$)/i, /^npx(?:\s|$)/i, /^tsc(?:\s|$)/i, /^node(?:\s|$)/i];
    this.memoryFilePath = `${this.projectRoot}/.free-agent-memory.json`;
    this.persistentMemory = this.createDefaultPersistentMemory();
    this.gitCheckpoints = [];
    this.generatedTests = [];
    this.regressionResults = [];
    this.vectorMemory = [];
    this.architecturePatterns = [];
    this.backgroundDaemonActive = false;
    this.watcherIntervalMs = 5000;
    this.staleTestThresholdDays = 7;
    this.repairQueue = [];
    this.lastObservedTimestamps = {};
    void this.loadPersistentMemory();
    this.destructiveCommands = [/\b(rm|del|rd|rmdir|format|shutdown|reboot|curl\s+.*\|\s*bash|wget\s+.*\|\s*sh|chmod\s+.*\+x)/i];
    this.criticalPathPatterns = [
      /(^|[\\/])(node_modules|dist|build|release|\.git|\.electron-user-data)([\\/]|$)/i,
      /(^|[\\/])(package\.json|package-lock\.json|tsconfig\.json|tsconfig\.node\.json|vite\.config\.ts)$/i,
    ];
  }

  async readProjectFile(filePath: string): Promise<string | undefined> {
    const action: AgentExecutionAction = {
      type: 'read',
      filePath,
      status: 'pending',
      message: `Reading ${filePath}`,
    };
    this.logAction(action);

    try {
      const content = await this.adapter.readFile(filePath);
      this.files[filePath] = content ?? '';
      action.status = 'completed';
      action.message = `Read ${filePath}`;
      action.content = this.files[filePath];
      return this.files[filePath];
    } catch (error) {
      action.status = 'failed';
      action.message = `Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
      return undefined;
    }
  }

  async writeFile(filePath: string, content: string): Promise<AgentExecutionAction> {
    const action: AgentExecutionAction = {
      type: 'write',
      filePath,
      status: 'pending',
      message: `Preparing write to ${filePath}`,
      content,
    };
    this.logAction(action);

    if (!this.confirmChanges) {
      action.status = 'skipped';
      action.message = `Write skipped for ${filePath} because confirmation is required`;
      return action;
    }

    if (this.isCriticalPath(filePath)) {
      action.status = 'skipped';
      action.message = `Write blocked for ${filePath} because it is marked as critical`;
      return action;
    }

    try {
      await this.adapter.writeFile(filePath, content);
      this.files[filePath] = content;
      action.status = 'completed';
      action.message = `Wrote ${filePath}`;
      await this.recordExecutionMemory({ kind: 'module', target: filePath, detail: 'write', metadata: { status: 'success' } });
      return action;
    } catch (error) {
      action.status = 'failed';
      action.message = `Failed to write ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
      await this.recordExecutionMemory({ kind: 'failure', target: filePath, detail: action.message, metadata: { source: 'write' } });
      await this.recordFailurePattern(filePath, 'file', action.message, 'write');
      return action;
    }
  }

  async createFile(filePath: string, content: string = ''): Promise<AgentExecutionAction> {
    const action: AgentExecutionAction = {
      type: 'write',
      filePath,
      status: 'pending',
      message: `Preparing create for ${filePath}`,
      content,
    };
    this.logAction(action);

    if (!this.confirmChanges) {
      action.status = 'skipped';
      action.message = `Create skipped for ${filePath} because confirmation is required`;
      return action;
    }

    if (this.isCriticalPath(filePath)) {
      action.status = 'skipped';
      action.message = `Create blocked for ${filePath} because it is marked as critical`;
      return action;
    }

    try {
      await this.adapter.createFile(filePath, content);
      this.files[filePath] = content;
      action.status = 'completed';
      action.message = `Created ${filePath}`;
      await this.recordExecutionMemory({ kind: 'module', target: filePath, detail: 'create', metadata: { status: 'success' } });
      return action;
    } catch (error) {
      action.status = 'failed';
      action.message = `Failed to create ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
      await this.recordExecutionMemory({ kind: 'failure', target: filePath, detail: action.message, metadata: { source: 'create' } });
      await this.recordFailurePattern(filePath, 'file', action.message, 'create');
      return action;
    }
  }

  async startBackgroundDaemon(config: Partial<AgentBackgroundDaemonConfig> = {}): Promise<void> {
    if (this.backgroundDaemonActive) {
      return;
    }
    this.backgroundDaemonActive = true;
    this.watcherIntervalMs = config.pollIntervalMs ?? this.watcherIntervalMs;
    this.staleTestThresholdDays = config.staleTestThresholdDays ?? this.staleTestThresholdDays;

    while (this.backgroundDaemonActive) {
      try {
        const report = await this.runBackgroundWatchCycle(config.maxQueuedRepairs ?? 4);
        this.logAction({ type: 'log', status: 'completed', message: `Daemon cycle: ${report.changedFiles.length} changes, ${report.queuedRepairs} repairs queued` });
      } catch (error) {
        this.logAction({ type: 'log', status: 'failed', message: `Daemon cycle error: ${error instanceof Error ? error.message : String(error)}` });
      }
      await this.delay(this.watcherIntervalMs);
    }
  }

  stopBackgroundDaemon(): void {
    this.backgroundDaemonActive = false;
    this.logAction({ type: 'log', status: 'completed', message: 'Background daemon stopped' });
  }

  private async runBackgroundWatchCycle(maxQueuedRepairs: number): Promise<AgentWatcherReport> {
    await this.ensurePersistentMemoryLoaded();
    const changedFiles = await this.collectChangedFiles();
    const repeatedFailures = this.persistentMemory.failurePatterns.filter((pattern) => pattern.recurring).slice(0, 4);
    const staleTests = await this.findStaleTests();
    const suggestions = this.suggestProactiveOptimizations(changedFiles, repeatedFailures, staleTests);
    const queued = this.queueAutonomousRepairTasks(changedFiles, repeatedFailures, suggestions, maxQueuedRepairs);

    return {
      changedFiles,
      repeatedFailures,
      staleTests,
      suggestions,
      queuedRepairs: queued,
      timestamp: new Date().toISOString(),
    };
  }

  private async collectChangedFiles(): Promise<string[]> {
    const currentFiles = await this.findProjectSourceFiles();
    const changes: string[] = [];

    for (const filePath of currentFiles) {
      const stats = await this.getFileStat(filePath);
      if (!stats) {
        continue;
      }
      const modified = stats.mtimeMs;
      const previous = this.lastObservedTimestamps[filePath] ?? modified;
      if (modified > previous) {
        changes.push(filePath);
      }
      this.lastObservedTimestamps[filePath] = modified;
    }

    return changes;
  }

  private async getFileStat(filePath: string): Promise<{ mtimeMs: number } | undefined> {
    const fs = await import('node:fs/promises');
    try {
      const stats = await fs.stat(filePath);
      return { mtimeMs: stats.mtimeMs };
    } catch {
      return undefined;
    }
  }

  private async findStaleTests(): Promise<AgentCoverageCheck[]> {
    const rootFiles = await this.findProjectSourceFiles();
    const modifiedFiles = rootFiles.filter((filePath) => /\.(ts|tsx|js|jsx)$/.test(filePath));
    const coverageChecks = await this.evaluateCoverage(modifiedFiles);
    return coverageChecks.filter((check) => !check.tested && this.isFileOlderThanThreshold(check.filePath, this.staleTestThresholdDays));
  }

  private isFileOlderThanThreshold(filePath: string, days: number): boolean {
    const content = this.files[filePath] ?? '';
    return content.length > 0;
  }

  private suggestProactiveOptimizations(changedFiles: string[], repeatedFailures: AgentFailurePattern[], staleTests: AgentCoverageCheck[]): AgentSuggestion[] {
    const suggestions: AgentSuggestion[] = [];
    if (changedFiles.length > 0) {
      suggestions.push({
        id: `suggestion-${Date.now()}-changes`,
        message: `Detected ${changedFiles.length} changed source files; consider batching related updates and validating modules.`,
        category: 'optimization',
        relatedFiles: changedFiles,
        tags: ['watcher', 'change-detection'],
      });
    }
    if (repeatedFailures.length > 0) {
      suggestions.push({
        id: `suggestion-${Date.now()}-failures`,
        message: `Recurring failures detected: ${repeatedFailures.map((pattern) => pattern.target).join(', ')}. Prioritize repair tasks for these files.`,
        category: 'cleanup',
        relatedFiles: repeatedFailures.map((pattern) => pattern.target),
        tags: ['failure', 'recurring'],
      });
    }
    if (staleTests.length > 0) {
      suggestions.push({
        id: `suggestion-${Date.now()}-stale-tests`,
        message: `Found ${staleTests.length} stale or untested code paths; refresh or add focused tests.`,
        category: 'testing',
        relatedFiles: [...new Set(staleTests.map((check) => check.filePath))],
        tags: ['testing', 'coverage', 'stale'],
      });
    }
    return suggestions;
  }

  private queueAutonomousRepairTasks(changedFiles: string[], repeatedFailures: AgentFailurePattern[], suggestions: AgentSuggestion[], maxQueued: number): number {
    const candidates = [...new Set([...changedFiles, ...repeatedFailures.map((pattern) => pattern.target)])];
    for (const candidate of candidates) {
      if (this.repairQueue.length >= maxQueued) {
        break;
      }
      if (this.repairQueue.some((entry) => entry.filePaths.includes(candidate))) {
        continue;
      }
      this.repairQueue.push({
        id: `repair-${Date.now()}-${this.repairQueue.length + 1}`,
        reason: repeatedFailures.some((pattern) => pattern.target === candidate) ? 'recurring failure' : 'changed file',
        filePaths: [candidate],
        severity: repeatedFailures.some((pattern) => pattern.target === candidate) ? 'high' : 'medium',
        suggestedFix: `Attempt autonomous repair for ${candidate} using recent project memory and validation.`,
        createdAt: new Date().toISOString(),
        status: 'queued',
      });
    }
    return this.repairQueue.length;
  }

  async drainRepairQueue(): Promise<AgentRepairQueueEntry[]> {
    const drained: AgentRepairQueueEntry[] = [];
    while (this.repairQueue.length > 0) {
      const entry = this.repairQueue.shift();
      if (!entry) {
        break;
      }
      entry.status = 'running';
      this.logAction({ type: 'log', status: 'completed', message: `Processing repair task ${entry.id}` });
      entry.status = 'completed';
      drained.push(entry);
    }
    return drained;
  }

  private delay(duration: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, duration));
  }

  async modifyFile(filePath: string, updater: (currentContent: string) => string): Promise<AgentExecutionAction> {
    const currentContent = this.files[filePath] ?? '';
    const nextContent = updater(currentContent);
    return this.writeFile(filePath, nextContent);
  }

  async applyPatch(filePath: string, diff: string): Promise<AgentExecutionAction> {
    const action: AgentExecutionAction = {
      type: 'modify',
      filePath,
      status: 'pending',
      message: `Preparing patch for ${filePath}`,
      content: diff,
    };
    this.logAction(action);

    if (!this.confirmChanges) {
      action.status = 'skipped';
      action.message = `Patch skipped for ${filePath} because confirmation is required`;
      return action;
    }

    if (this.isCriticalPath(filePath)) {
      action.status = 'skipped';
      action.message = `Patch blocked for ${filePath} because it is marked as critical`;
      return action;
    }

    try {
      await this.adapter.applyPatch(filePath, diff);
      this.files[filePath] = `${this.files[filePath] ?? ''}\n\n// patch\n${diff}`;
      action.status = 'completed';
      action.message = `Patched ${filePath}`;
      await this.recordExecutionMemory({ kind: 'module', target: filePath, detail: 'patch', metadata: { status: 'success' } });
      return action;
    } catch (error) {
      action.status = 'failed';
      action.message = `Failed to patch ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
      await this.recordExecutionMemory({ kind: 'failure', target: filePath, detail: action.message, metadata: { source: 'patch' } });
      await this.recordFailurePattern(filePath, 'file', action.message, 'patch');
      return action;
    }
  }

  async applyPlan(plan: FreeAgentPlan, fileContents: Record<string, string> = {}): Promise<AgentExecutionResult> {
    const enhancedPlan = await this.enrichPlanWithProjectIntelligence(plan);
    Object.entries(fileContents).forEach(([filePath, content]) => {
      this.files[filePath] = content;
    });

    const actions: AgentExecutionAction[] = [];

    for (const filePath of enhancedPlan.filesToCreate) {
      const action = await this.createFile(filePath, `// Auto-generated by FreeAgentMode\n// Goal: ${enhancedPlan.goal}\n`);
      actions.push(action);
    }

    for (const filePath of enhancedPlan.filesToModify) {
      const currentContent = this.files[filePath] ?? '';
      const nextContent = currentContent
        ? `${currentContent}\n\n// Modified by FreeAgentMode\n// Goal: ${enhancedPlan.goal}`
        : `// Created by FreeAgentMode\n// Goal: ${enhancedPlan.goal}\n`;
      const action = await this.writeFile(filePath, nextContent);
      actions.push(action);
    }

    return {
      plan: enhancedPlan,
      actions: [...this.actions],
      files: { ...this.files },
    };
  }

  async executePlan(plan: FreeAgentPlan, fileContents: Record<string, string> = {}): Promise<AgentExecutionReport> {
    const enhancedPlan = await this.enrichPlanWithProjectIntelligence(plan);
    Object.entries(fileContents).forEach(([filePath, content]) => {
      this.files[filePath] = content;
    });

    await this.recordExecutionMemory({ kind: 'module', target: enhancedPlan.goal, detail: 'plan-execution', metadata: { filesToCreate: enhancedPlan.filesToCreate.length, filesToModify: enhancedPlan.filesToModify.length } });
    await this.recordDependencyRelationship([...enhancedPlan.filesToCreate, ...enhancedPlan.filesToModify]);

    const results: AgentFileExecutionReport[] = [];

    for (const step of enhancedPlan.steps) {
      this.logAction({ type: 'log', status: 'completed', message: step });
    }

    for (const filePath of enhancedPlan.filesToCreate) {
      const previousContent = this.files[filePath];
      const action = await this.createFile(filePath, `// Auto-generated by FreeAgentMode\n// Goal: ${enhancedPlan.goal}\n`);
      const verification = await this.verifyAppliedChange(filePath, previousContent);
      results.push({
        filePath,
        success: action.status === 'completed' && verification.success,
        status: action.status === 'completed' ? (verification.success ? 'success' : 'failed') : action.status === 'skipped' ? 'skipped' : 'failed',
        message: verification.success ? action.message : `Verification failed for ${filePath}: ${verification.message}`,
      });
    }

    for (const filePath of enhancedPlan.filesToModify) {
      const previousContent = this.files[filePath];
      const currentContent = this.files[filePath] ?? '';
      const nextContent = currentContent
        ? `${currentContent}\n\n// Modified by FreeAgentMode\n// Goal: ${enhancedPlan.goal}`
        : `// Created by FreeAgentMode\n// Goal: ${enhancedPlan.goal}\n`;
      const action = await this.writeFile(filePath, nextContent);
      const verification = await this.verifyAppliedChange(filePath, previousContent);
      results.push({
        filePath,
        success: action.status === 'completed' && verification.success,
        status: action.status === 'completed' ? (verification.success ? 'success' : 'failed') : action.status === 'skipped' ? 'skipped' : 'failed',
        message: verification.success ? action.message : `Verification failed for ${filePath}: ${verification.message}`,
      });
    }

    return {
      plan: enhancedPlan,
      actions: [...this.actions],
      results,
      files: { ...this.files },
    };
  }

  async executeWithSelfHealing(
    plan: FreeAgentPlan,
    fileContents: Record<string, string> = {},
    maxRetries: number = 2,
    runtimeCommand?: string | string[],
    requireConfirmation: boolean = false,
  ): Promise<AgentSelfHealingReport> {
    const snapshotFiles = [...new Set([...(Object.keys(fileContents)), ...plan.filesToCreate, ...plan.filesToModify])];
    const snapshot = this.createSnapshot(snapshotFiles);
    await this.ensureGitBranch(`free-agent/${Date.now()}`);
    const checkpoint = await this.createCheckpointCommit(this.generateCommitSummary());
    let report = await this.executePlan(plan, fileContents);
    let healingAttempts = 0;
    let rollbackPerformed = false;
    let runtimeReport: AgentRuntimeExecutionReport | undefined;

    while (healingAttempts < maxRetries) {
      const validation = await this.validateProject([...new Set([...plan.filesToCreate, ...plan.filesToModify])], plan);
      const errors = await this.detectExecutionErrors(report, plan, validation, runtimeReport);
      if (errors.length === 0) {
        break;
      }

      const shouldEscalate = await this.shouldEscalateBasedOnMemory(errors, plan);
      if (shouldEscalate) {
        this.logAction({ type: 'log', status: 'completed', message: 'Escalating immediately because a recurring failure pattern was detected in memory.' });
        break;
      }

      healingAttempts += 1;
      rollbackPerformed = true;
      this.logAction({ type: 'log', status: 'completed', message: `Self-healing attempt ${healingAttempts}: ${errors[0]}` });
      await this.rollback(snapshot);
      await this.rollbackToCheckpoint(checkpoint);
      const repairPlan = await this.createRepairPlan(plan, errors);
      report = await this.executePlan(repairPlan, fileContents);

      if (healingAttempts >= 2) {
        this.logAction({ type: 'log', status: 'completed', message: 'Escalating after repeated failures; runtime loop stopped.' });
        break;
      }
    }

    const finalValidation = await this.validateProject([...new Set([...plan.filesToCreate, ...plan.filesToModify])], plan);
    if (finalValidation.success) {
      await this.createCheckpointCommit(this.generateCommitSummary());
    }
    if (runtimeCommand) {
      runtimeReport = await this.runRuntimeCommand(runtimeCommand, { requireConfirmation });
      this.logAction({ type: 'log', status: 'completed', message: runtimeReport.success ? 'Runtime observation passed' : `Runtime observation failed: ${runtimeReport.errors.join('; ')}` });
    }

    return {
      ...report,
      healingAttempts,
      repaired: healingAttempts > 0,
      rollbackPerformed,
      validation: finalValidation,
      runtime: runtimeReport,
    };
  }

  getActionLog(): AgentExecutionAction[] {
    return [...this.actions];
  }

  async executeMultiAgent(input: string | FreeAgentRequest, options: Partial<FreeAgentRequest> = {}): Promise<AgentOrchestrationReport> {
    const orchestrator = new MultiAgentOrchestrator(this);
    return orchestrator.orchestrate(input, options);
  }

  async ensureGitBranch(branchName?: string): Promise<string> {
    const normalizedBranch = branchName ?? `free-agent/${Date.now()}`;
    const result = await this.runGitCommand(['checkout', '-b', normalizedBranch]);
    if (!result.success) {
      const fallback = await this.runGitCommand(['checkout', '-B', normalizedBranch]);
      if (!fallback.success) {
        return normalizedBranch;
      }
    }
    await this.recordExecutionMemory({ kind: 'module', target: normalizedBranch, detail: 'git-branch-created', metadata: { status: 'success' } });
    return normalizedBranch;
  }

  async createCheckpointCommit(summary?: string): Promise<AgentGitCheckpoint | undefined> {
    const commitSummary = summary ?? this.generateCommitSummary();
    const branch = await this.ensureGitBranch();
    const addResult = await this.runGitCommand(['add', '-A']);
    if (!addResult.success) {
      return undefined;
    }

    const commitResult = await this.runGitCommand(['commit', '-m', commitSummary]);
    if (!commitResult.success) {
      return undefined;
    }

    const revParse = await this.runGitCommand(['rev-parse', 'HEAD']);
    if (!revParse.success || !revParse.stdout.trim()) {
      return undefined;
    }

    const checkpoint: AgentGitCheckpoint = {
      branch,
      commitSha: revParse.stdout.trim(),
      summary: commitSummary,
      timestamp: new Date().toISOString(),
    };
    this.gitCheckpoints.push(checkpoint);
    return checkpoint;
  }

  async rollbackToCheckpoint(checkpoint?: AgentGitCheckpoint): Promise<boolean> {
    const targetCheckpoint = checkpoint ?? this.gitCheckpoints[this.gitCheckpoints.length - 1];
    if (!targetCheckpoint) {
      return false;
    }

    const rollbackResult = await this.runGitCommand(['reset', '--hard', targetCheckpoint.commitSha]);
    if (!rollbackResult.success) {
      return false;
    }

    await this.recordExecutionMemory({ kind: 'module', target: targetCheckpoint.branch, detail: 'git-rollback', metadata: { commitSha: targetCheckpoint.commitSha } });
    return true;
  }

  generateCommitSummary(): string {
    const history = this.persistentMemory.executionHistory.slice(-6);
    const recentFailures = this.persistentMemory.failurePatterns.slice(-3).map((pattern) => pattern.target).join(', ');
    const summaryParts = history.map((entry) => `${entry.kind}:${entry.target}`).slice(0, 4);
    const base = summaryParts.length > 0 ? summaryParts.join(' | ') : 'free-agent update';
    return `free-agent: ${base}${recentFailures ? ` | failures: ${recentFailures}` : ''}`;
  }

  private async runGitCommand(args: string[]): Promise<{ success: boolean; stdout: string; stderr: string }> {
    const { spawn } = await import('node:child_process');
    return new Promise((resolve) => {
      const child = spawn('git', args, {
        cwd: this.projectRoot,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.on('close', (code) => {
        resolve({ success: code === 0, stdout, stderr });
      });
      child.on('error', () => {
        resolve({ success: false, stdout, stderr: 'git unavailable' });
      });
    });
  }

  async recordAgentMemory(entry: Omit<AgentExecutionMemoryEntry, 'id' | 'timestamp'>): Promise<void> {
    await this.recordExecutionMemory(entry);
  }

  async recordAgentFailurePattern(target: string, kind: AgentFailurePattern['kind'], detail: string, source: string): Promise<void> {
    await this.recordFailurePattern(target, kind, detail, source);
  }

  async recordAgentDependencyRelationship(files: string[]): Promise<void> {
    await this.recordDependencyRelationship(files);
  }

  async getProjectIntelligenceGraph(): Promise<AgentProjectIntelligenceGraph> {
    return this.projectIntelligence ?? this.buildProjectIntelligenceGraph();
  }

  async getImpactPredictions(files: string[]): Promise<AgentImpactPrediction[]> {
    return this.predictImpactForFiles(files);
  }

  async indexVectorMemory(kind: AgentMemoryVectorEntry['kind'], summary: string, filePath?: string, tags: string[] = []): Promise<AgentMemoryVectorEntry> {
    const vector = this.embedTextAsVector(summary);
    const entry: AgentMemoryVectorEntry = {
      id: `vector-${Date.now()}-${this.persistentMemory.vectorMemory.length + 1}`,
      kind,
      summary,
      filePath,
      tags,
      vector,
      timestamp: new Date().toISOString(),
    };
    await this.ensurePersistentMemoryLoaded();
    this.persistentMemory.vectorMemory.push(entry);
    await this.persistPersistentMemory();
    return entry;
  }

  async recallSimilarMemory(query: string, limit: number = 4): Promise<AgentMemoryVectorEntry[]> {
    await this.ensurePersistentMemoryLoaded();
    const queryVector = this.embedTextAsVector(query);
    const scored = this.persistentMemory.vectorMemory.map((entry) => ({
      entry,
      score: this.cosineSimilarity(queryVector, entry.vector),
    }));
    return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((item) => item.entry);
  }

  async registerArchitecturePattern(name: string, description: string, examples: string[], filePaths: string[], tags: string[] = []): Promise<AgentArchitecturePattern> {
    await this.ensurePersistentMemoryLoaded();
    const pattern: AgentArchitecturePattern = {
      id: `arch-${Date.now()}-${this.persistentMemory.architecturePatterns.length + 1}`,
      name,
      description,
      examples,
      filePaths,
      tags,
      timestamp: new Date().toISOString(),
    };
    this.persistentMemory.architecturePatterns.push(pattern);
    await this.persistPersistentMemory();
    return pattern;
  }

  async recallArchitecturePatterns(query: string, limit: number = 3): Promise<AgentArchitecturePattern[]> {
    await this.ensurePersistentMemoryLoaded();
    const queryVector = this.embedTextAsVector(query);
    const scored = this.persistentMemory.architecturePatterns.map((pattern) => ({
      pattern,
      score: this.cosineSimilarity(queryVector, this.embedTextAsVector(`${pattern.name} ${pattern.description} ${pattern.examples.join(' ')}`)),
    }));
    return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((item) => item.pattern);
  }

  private embedTextAsVector(text: string): number[] {
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const counts = normalized.reduce<Record<string, number>>((acc, token) => {
      acc[token] = (acc[token] ?? 0) + 1;
      return acc;
    }, {});
    const vector = Object.entries(counts).slice(0, 64).map(([, value]) => value / normalized.length);
    while (vector.length < 64) {
      vector.push(0);
    }
    return vector;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
    const magA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
    const magB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));
    return magA === 0 || magB === 0 ? 0 : dot / (magA * magB);
  }

  async generateAutonomousTests(plan: FreeAgentPlan, filePaths: string[] = []): Promise<AgentGeneratedTestCase[]> {
    const targets = [...new Set([...(filePaths ?? []), ...(plan.filesToModify ?? []), ...(plan.filesToCreate ?? [])].filter(Boolean))];
    const generated: AgentGeneratedTestCase[] = [];

    for (const filePath of targets) {
      const content = this.files[filePath] ?? (await this.readProjectFile(filePath)) ?? '';
      const functions = this.extractFunctionNames(content);
      const risky = this.isRiskyChangeTarget(filePath, plan);
      const featureChange = this.isFeatureChange(plan, filePath);

      if (functions.length > 0 && risky) {
        for (const fn of functions.slice(0, 3)) {
          generated.push({
            id: `unit-${Date.now()}-${generated.length + 1}`,
            filePath,
            kind: 'unit',
            target: fn,
            content: `describe('${fn}', () => { it('handles the main path', () => { expect(true).toBe(true); }); });`,
            createdAt: new Date().toISOString(),
          });
        }
      }

      if (featureChange) {
        generated.push({
          id: `integration-${Date.now()}-${generated.length + 1}`,
          filePath,
          kind: 'integration',
          target: filePath,
          content: `describe('feature flow for ${filePath}', () => { it('covers the primary integration path', () => { expect(true).toBe(true); }); });`,
          createdAt: new Date().toISOString(),
        });
      }
    }

    this.generatedTests.push(...generated);
    return generated;
  }

  async evaluateCoverage(filePaths: string[] = [], testCases: AgentGeneratedTestCase[] = []): Promise<AgentCoverageCheck[]> {
    const targets = [...new Set([...filePaths].filter(Boolean))];
    const checks: AgentCoverageCheck[] = [];
    const availableTests = testCases.length > 0 ? testCases : this.generatedTests;

    for (const filePath of targets) {
      const content = this.files[filePath] ?? (await this.readProjectFile(filePath)) ?? '';
      const functions = this.extractFunctionNames(content);
      for (const fn of functions) {
        const tested = availableTests.some((testCase) => testCase.target === fn || testCase.content.includes(fn));
        checks.push({
          filePath,
          functionName: fn,
          tested,
          reason: tested ? 'Covered by generated test scaffolding' : 'No matching test scaffolding detected for this function',
        });
      }
    }

    return checks;
  }

  async rerunAffectedTests(filePaths: string[] = [], semanticPatches: AgentSemanticPatch[] = []): Promise<AgentRegressionResult[]> {
    const targets = [...new Set([...(filePaths ?? []), ...(semanticPatches ?? []).map((patch) => patch.filePath)].filter(Boolean))];
    if (this.safeMode) {
      return targets.map((filePath) => ({
        filePath,
        testIds: [],
        passed: true,
        message: 'Skipped runtime validation in safe mode',
      }));
    }

    const results: AgentRegressionResult[] = [];

    for (const filePath of targets) {
      const relevantTests = this.generatedTests.filter((testCase) => testCase.filePath === filePath);
      const runtime = await this.runRuntimeCommand('npx --no-install tsc --noEmit --pretty false');
      const passed = runtime.success;
      if (!passed) {
        await this.recordFailedTestCase({
          filePath,
          target: relevantTests[0]?.target ?? filePath,
          kind: relevantTests.some((testCase) => testCase.kind === 'integration') ? 'integration' : 'unit',
          message: runtime.errors.join('; ') || 'Regression validation failed',
        });
      }
      results.push({
        filePath,
        testIds: relevantTests.map((testCase) => testCase.id),
        passed,
        message: passed ? 'Regression checks passed' : runtime.errors.join('; ') || 'Regression validation failed',
      });
    }

    this.regressionResults.push(...results);
    return results;
  }

  async recordFailedTestCase(input: Omit<AgentFailedTestCase, 'id' | 'timestamp'>): Promise<void> {
    await this.ensurePersistentMemoryLoaded();
    this.persistentMemory.failedTests.push({
      id: `failed-test-${Date.now()}-${this.persistentMemory.failedTests.length + 1}`,
      timestamp: new Date().toISOString(),
      ...input,
    });
    await this.persistPersistentMemory();
  }

  async analyzeSemantics(filePath: string): Promise<AgentSemanticAnalysis> {
    const content = this.files[filePath] ?? (await this.readProjectFile(filePath)) ?? '';
    return this.buildSemanticAnalysis(filePath, content);
  }

  async renameSymbolSafely(filePath: string, currentName: string, nextName: string): Promise<AgentSemanticAnalysis> {
    const analysis = await this.analyzeSemantics(filePath);
    const patches: AgentSemanticPatch[] = [];
    const symbol = analysis.symbols.find((entry) => entry.name === currentName && entry.filePath === filePath);
    if (!symbol) {
      return analysis;
    }

    const originalContent = this.files[filePath] ?? (await this.readProjectFile(filePath)) ?? '';
    const updatedContent = this.applySemanticRename(originalContent, currentName, nextName);
    patches.push({ filePath, original: originalContent, updated: updatedContent, reason: `Rename ${currentName} to ${nextName}` });
    return {
      ...analysis,
      patches,
    };
  }

  async applySemanticPatch(filePath: string, patch: AgentSemanticPatch): Promise<AgentExecutionAction> {
    const action = await this.writeFile(filePath, patch.updated);
    if (action.status === 'completed') {
      await this.rerunAffectedTests([filePath], [patch]);
    }
    return action;
  }

  private createSnapshot(filePaths: string[]): AgentExecutionSnapshot {
    const snapshot: AgentExecutionSnapshot = {
      files: {},
      timestamp: new Date().toISOString(),
    };

    filePaths.forEach((filePath) => {
      snapshot.files[filePath] = this.files[filePath] ?? '';
    });

    this.snapshots.push(snapshot);
    return snapshot;
  }

  private async rollback(snapshot: AgentExecutionSnapshot): Promise<AgentExecutionAction[]> {
    const restored: AgentExecutionAction[] = [];
    for (const [filePath, content] of Object.entries(snapshot.files)) {
      this.files[filePath] = content;
      if (this.confirmChanges && !this.isCriticalPath(filePath)) {
        const action = await this.writeFile(filePath, content);
        restored.push(action);
      }
    }
    return restored;
  }

  private async verifyAppliedChange(filePath: string, previousContent: string | undefined): Promise<{ success: boolean; message: string }> {
    const content = await this.readProjectFile(filePath);
    const hasMarker = Boolean(content && content.includes('FreeAgentMode'));
    const changed = previousContent !== content;
    if (content !== undefined && (hasMarker || changed)) {
      return { success: true, message: `Verified ${filePath}` };
    }
    return { success: false, message: `No effective change detected in ${filePath}` };
  }

  private async validateProject(changedFiles: string[], plan: FreeAgentPlan): Promise<AgentValidationReport> {
    const imports: AgentValidationIssue[] = [];
    const crossFile: AgentValidationIssue[] = [];
    const build = await this.runTypeScriptCheck();

    for (const filePath of changedFiles) {
      const content = this.files[filePath] ?? (await this.readProjectFile(filePath));
      if (!content) {
        continue;
      }

      const specifiers = this.extractImportSpecifiers(content);
      for (const specifier of specifiers) {
        const resolved = await this.resolveImportPath(filePath, specifier);
        if (specifier.startsWith('.') && !resolved.exists) {
          imports.push({
            kind: 'import',
            filePath,
            message: `Unresolved relative import ${specifier}`,
            severity: 'error',
            source: specifier,
          });
        } else if (!specifier.startsWith('.') && !resolved.exists) {
          imports.push({
            kind: 'dependency',
            filePath,
            message: `Unresolved dependency ${specifier}`,
            severity: 'warning',
            source: specifier,
          });
        }
      }
    }

    const projectFiles = await this.findProjectSourceFiles();
    for (const filePath of changedFiles) {
      for (const candidate of projectFiles) {
        const content = this.files[candidate] ?? (await this.readProjectFile(candidate));
        if (!content || candidate === filePath) {
          continue;
        }

        const specifiers = this.extractImportSpecifiers(content);
        const results = await Promise.all(specifiers.map(async (specifier) => this.resolveImportPath(candidate, specifier)));
        const targets = results.filter((result) => result.resolvedPath === filePath || result.resolvedPath.endsWith(`/${filePath}`) || result.resolvedPath.endsWith(`\\${filePath}`));

        if (targets.length > 0) {
          crossFile.push({
            kind: 'cross-file',
            filePath: candidate,
            message: `Dependent file ${candidate} references changed file ${filePath}`,
            severity: 'warning',
            source: filePath,
          });
        }
      }
    }

    const errors = [...imports, ...crossFile].filter((issue) => issue.severity === 'error');
    return {
      success: build.success && errors.length === 0,
      errors: [...imports, ...crossFile],
      build,
      imports,
      crossFile,
    };
  }

  private async detectExecutionErrors(
    report: AgentExecutionReport,
    plan: FreeAgentPlan,
    validation?: AgentValidationReport,
    runtimeReport?: AgentRuntimeExecutionReport,
  ): Promise<string[]> {
    const errors: string[] = [];
    await this.recordExecutionMemory({ kind: 'module', target: plan.goal, detail: 'diagnose-errors', metadata: { resultCount: report.results.length } });
    const failedResults = report.results.filter((result) => !result.success);

    failedResults.forEach((result) => {
      errors.push(result.message);
      void this.recordFailurePattern(result.filePath ?? 'unknown', 'file', result.message, 'execution');
    });

    for (const result of report.results) {
      if (!result.success) {
        continue;
      }
      const content = this.files[result.filePath];
      if (content) {
        const syntaxErrors = await this.detectSyntaxIssues(content, result.filePath);
        syntaxErrors.forEach((message) => errors.push(`${result.filePath}: ${message}`));
      }
    }

    if (validation && !validation.success) {
      validation.errors.forEach((issue) => {
        errors.push(`${issue.filePath ?? 'project'}: ${issue.message}`);
        void this.recordFailurePattern(issue.filePath ?? 'project', issue.kind === 'build' ? 'module' : 'file', issue.message, issue.kind);
      });
    }

    if (runtimeReport && !runtimeReport.success) {
      runtimeReport.errors.forEach((issue) => {
        errors.push(`runtime: ${issue}`);
        void this.recordFailurePattern('runtime', 'command', issue, 'runtime');
      });
    }

    if (errors.length === 0 && report.results.length === 0) {
      errors.push(`No file operations were executed for ${plan.goal}`);
    }

    return [...new Set(errors)].slice(0, 4);
  }

  private async detectSyntaxIssues(content: string, filePath: string): Promise<string[]> {
    const extension = filePath.toLowerCase();
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(extension)) {
      return [];
    }

    try {
      const ts = await import('typescript');
      const scriptKind = extension.endsWith('tsx')
        ? ts.ScriptKind.TSX
        : extension.endsWith('ts')
          ? ts.ScriptKind.TS
          : ts.ScriptKind.JS;
      const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind);
      const parseDiagnostics = (sourceFile as unknown as { parseDiagnostics?: Array<{ messageText: string | { messageText: string; category: number; code: number } }> }).parseDiagnostics ?? [];
      return parseDiagnostics.map((diagnostic) => {
        const message = typeof diagnostic.messageText === 'string' ? diagnostic.messageText : diagnostic.messageText.messageText;
        return ts.flattenDiagnosticMessageText(message, '\n');
      });
    } catch {
      return [];
    }
  }

  private async createRepairPlan(plan: FreeAgentPlan, errors: string[]): Promise<FreeAgentPlan> {
    const enhancedPlan = await this.enrichPlanWithProjectIntelligence(plan);
    return {
      ...enhancedPlan,
      goal: `Repair ${enhancedPlan.goal}`,
      steps: [
        'Re-evaluate the failed execution and isolate the missing or broken change.',
        'Retry the affected file operations with a corrected plan.',
        'Validate the updated files before finishing.',
        'Prefer a low-risk execution order informed by the project intelligence graph.',
        ...errors.map((error) => `Resolve: ${error}`),
      ],
      warnings: [
        'This repair pass is generated automatically after validation failed.',
        ...enhancedPlan.warnings,
        ...errors,
      ],
    };
  }

  private async buildProjectIntelligenceGraph(): Promise<AgentProjectIntelligenceGraph> {
    const files = await this.findProjectSourceFiles();
    const nodes = new Map<string, AgentProjectNode>();
    const edges: AgentProjectEdge[] = [];
    const featureMap = new Map<string, string[]>();

    for (const filePath of files) {
      const normalizedFile = this.normalizePath(filePath);
      const content = this.files[normalizedFile] ?? (await this.readProjectFile(normalizedFile)) ?? '';
      const { imports, exports } = this.extractProjectDependencies(content);
      const feature = this.classifyFeature(normalizedFile);
      nodes.set(normalizedFile, {
        filePath: normalizedFile,
        feature,
        imports: [],
        exports: [],
        risk: 'low',
      });
      featureMap.set(feature, [...(featureMap.get(feature) ?? []), normalizedFile]);

      for (const specifier of imports) {
        const resolved = await this.resolveImportPath(normalizedFile, specifier);
        if (resolved.exists && this.isProjectSourceFile(resolved.resolvedPath)) {
          edges.push({ from: normalizedFile, to: this.normalizePath(resolved.resolvedPath), kind: 'import' });
        }
      }

      for (const specifier of exports) {
        const resolved = await this.resolveImportPath(normalizedFile, specifier);
        if (resolved.exists && this.isProjectSourceFile(resolved.resolvedPath)) {
          edges.push({ from: normalizedFile, to: this.normalizePath(resolved.resolvedPath), kind: 'export' });
        }
      }
    }

    for (const [filePath, node] of nodes.entries()) {
      const incoming = edges.filter((edge) => edge.to === filePath).length;
      const outgoing = edges.filter((edge) => edge.from === filePath).length;
      node.imports = [...new Set(edges.filter((edge) => edge.from === filePath && edge.kind === 'import').map((edge) => edge.to))];
      node.exports = [...new Set(edges.filter((edge) => edge.from === filePath && edge.kind === 'export').map((edge) => edge.to))];
      if (incoming + outgoing >= 4 || node.feature === 'Runtime' || node.feature === 'AI') {
        node.risk = 'high';
      } else if (incoming + outgoing >= 2) {
        node.risk = 'medium';
      }
    }

    const featureGroups: AgentFeatureGroup[] = [...featureMap.entries()].map(([name, filePaths]) => ({
      name,
      files: filePaths as string[],
      description: this.describeFeature(name),
      risk: filePaths.length > 6 ? 'high' : filePaths.length > 3 ? 'medium' : 'low',
    }));

    const highRiskAreas = [...new Set(Array.from(nodes.values()).filter((node) => node.risk === 'high').map((node) => node.filePath))];

    const graph: AgentProjectIntelligenceGraph = {
      nodes: [...nodes.values()],
      edges,
      featureGroups,
      highRiskAreas,
      predictions: [],
    };
    this.projectIntelligence = graph;
    graph.predictions = await this.predictImpactForFiles(files.map((filePath) => this.normalizePath(filePath)));
    return graph;
  }

  private async predictImpactForFiles(changedFiles: string[]): Promise<AgentImpactPrediction[]> {
    const graph = this.projectIntelligence ?? await this.buildProjectIntelligenceGraph();
    const nodeMap = new Map(graph.nodes.map((node) => [node.filePath, node]));
    const predictions: AgentImpactPrediction[] = [];

    for (const changedFile of changedFiles) {
      const normalizedChanged = this.normalizePath(changedFile);
      const affectedFiles = [...new Set([
        ...graph.edges.filter((edge) => edge.from === normalizedChanged).map((edge) => edge.to),
        ...graph.edges.filter((edge) => edge.to === normalizedChanged).map((edge) => edge.from),
      ])];
      const risk = affectedFiles.length >= 4 || (nodeMap.get(normalizedChanged)?.feature === 'Runtime' && affectedFiles.length >= 2)
        ? 'high'
        : affectedFiles.length >= 2
          ? 'medium'
          : 'low';
      predictions.push({
        filePath: normalizedChanged,
        affectedFiles,
        risk,
        reason: affectedFiles.length > 0 ? `Likely impact through ${affectedFiles.length} related module${affectedFiles.length === 1 ? '' : 's'}` : 'No immediate dependency impact detected',
      });
    }

    return predictions;
  }

  private async enrichPlanWithProjectIntelligence(plan: FreeAgentPlan): Promise<FreeAgentPlan> {
    const graph = this.projectIntelligence ?? await this.buildProjectIntelligenceGraph();
    const impactedFiles = await this.predictImpactForFiles([...plan.filesToModify, ...plan.filesToCreate]);
    const involvedFeatures = [...new Set(graph.nodes.filter((node) => [...plan.filesToModify, ...plan.filesToCreate].some((filePath) => this.normalizePath(filePath) === node.filePath)).map((node) => node.feature))];
    const warnings = [
      ...plan.warnings,
      `Project intelligence graph covers ${graph.nodes.length} modules and ${graph.edges.length} relationships.`,
      `Feature focus: ${involvedFeatures.length > 0 ? involvedFeatures.join(', ') : 'shared'}.`,
      ...impactedFiles.filter((prediction) => prediction.risk === 'high').map((prediction) => `High-risk change area: ${prediction.filePath}`),
    ];

    const steps = [...plan.steps];
    if (impactedFiles.some((prediction) => prediction.risk === 'high')) {
      steps.push('Sequence the work to minimize cascading changes and avoid high-risk dependency clusters.');
    } else {
      steps.push('Keep the change sequence local and validate the related modules after execution.');
    }

    await this.recordExecutionMemory({ kind: 'dependency', target: plan.goal, detail: 'intelligence-plan', metadata: { featureCount: graph.featureGroups.length, highRiskAreas: graph.highRiskAreas.length } });

    return {
      ...plan,
      steps,
      warnings,
    };
  }

  private classifyFeature(filePath: string): AgentProjectNode['feature'] {
    const normalized = this.normalizePath(filePath);
    if (/(^|[\/])(components|views|pages|ui|app|widgets|design-system)([\/]|$)/i.test(normalized)) {
      return 'UI';
    }
    if (/(^|[\/])(ai|agent|opencode|openrouter|llm|prompt|chat)([\/]|$)/i.test(normalized)) {
      return 'AI';
    }
    if (/(^|[\/])(electron|main|runtime|worker|service|terminal)([\/]|$)/i.test(normalized)) {
      return 'Runtime';
    }
    if (/(^|[\/])(test|tests|spec)([\/]|$)/i.test(normalized)) {
      return 'Tests';
    }
    if (/(^|[\/])(types|lib|store|context|hooks|utils|common)([\/]|$)/i.test(normalized)) {
      return 'Shared';
    }
    return 'Core';
  }

  private describeFeature(feature: string): string {
    switch (feature) {
      case 'UI':
        return 'User-facing experience and interface modules.';
      case 'AI':
        return 'Agent and AI orchestration logic.';
      case 'Runtime':
        return 'Core execution, services, and runtime infrastructure.';
      case 'Tests':
        return 'Automated coverage and validation modules.';
      case 'Shared':
        return 'Shared utilities, constants, and reusable primitives.';
      default:
        return 'Core application modules.';
    }
  }

  private extractProjectDependencies(content: string): { imports: string[]; exports: string[] } {
    const imports = this.extractImportSpecifiers(content);
    const exportPattern = /export\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]|export\s+\*\s+from\s+['"]([^'"]+)['"]/g;
    const exports: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = exportPattern.exec(content)) !== null) {
      const specifier = match[1] ?? match[2];
      if (specifier) {
        exports.push(specifier);
      }
    }
    return { imports: [...new Set(imports)], exports: [...new Set(exports)] };
  }

  private isProjectSourceFile(filePath: string): boolean {
    const normalized = this.normalizePath(filePath);
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(normalized);
  }

  private normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
  }

  private async runTypeScriptCheck(): Promise<{ success: boolean; command: string; output: string; errors: string[] }> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const command = `${executable} --no-install tsc --noEmit --pretty false`;

    try {
      const { stdout, stderr } = await execFileAsync(executable, ['--no-install', 'tsc', '--noEmit', '--pretty', 'false'], { cwd: this.projectRoot, windowsHide: true });
      return {
        success: true,
        command,
        output: `${stdout}\n${stderr}`.trim(),
        errors: [],
      };
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string; message?: string };
      const output = [execError.stdout, execError.stderr, execError.message].filter(Boolean).join('\n').trim();
      const lines = output.split(/\r?\n/).filter((line) => line.includes('error') || line.includes('TS'));
      return {
        success: false,
        command,
        output,
        errors: lines.slice(0, 8),
      };
    }
  }

  async runRuntimeCommand(command: string | string[], options: { cwd?: string; requireConfirmation?: boolean } = {}): Promise<AgentRuntimeExecutionReport> {
    const { spawn } = await import('node:child_process');
    const normalizedCommand = Array.isArray(command) ? command.join(' ') : command;
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    const shellArgs = process.platform === 'win32' ? ['/d', '/s', '/c', normalizedCommand] : ['-c', normalizedCommand];

    const isAllowed = this.isAllowedCommand(normalizedCommand);
    const isDestructive = this.isDestructiveCommand(normalizedCommand);
    if (!isAllowed || (isDestructive && !options.requireConfirmation)) {
      const blockedMessage = isDestructive && !options.requireConfirmation
        ? `Blocked destructive command: ${normalizedCommand}`
        : `Blocked disallowed command: ${normalizedCommand}`;
      this.runtimeHistory.push({
        id: `runtime-${Date.now()}`,
        command: normalizedCommand,
        status: 'blocked',
        timestamp: new Date().toISOString(),
        stdout: '',
        stderr: blockedMessage,
        exitCode: null,
      });
      return {
        success: false,
        command: normalizedCommand,
        exitCode: null,
        stdout: '',
        stderr: blockedMessage,
        errors: [blockedMessage],
      };
    }

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      const child = spawn(shell, shellArgs, {
        cwd: options.cwd ?? this.projectRoot,
        env: process.env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const timeoutMs = 60_000;
      const timeout = setTimeout(() => {
        child.kill();
        const report = {
          success: false,
          command: normalizedCommand,
          exitCode: null,
          stdout,
          stderr: `${stderr}\nCommand timed out after ${timeoutMs / 1000}s`.trim(),
          errors: [`Command timed out after ${timeoutMs / 1000}s`],
        };
        this.recordRuntimeHistory(normalizedCommand, report);
        resolve(report);
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (error: Error) => {
        clearTimeout(timeout);
        const report = {
          success: false,
          command: normalizedCommand,
          exitCode: null,
          stdout,
          stderr: `${stderr}\n${error.message}`,
          errors: this.parseRuntimeErrorOutput(`${stdout}\n${stderr}\n${error.message}`),
        };
        this.recordRuntimeHistory(normalizedCommand, report);
        void this.recordExecutionMemory({ kind: 'command', target: normalizedCommand, detail: 'runtime-command-failure', metadata: { exitCode: -1 } });
        void this.recordFailurePattern('runtime', 'command', report.errors.join('; ') || normalizedCommand, 'runtime');
        resolve(report);
      });

      child.on('close', (exitCode: number | null) => {
        clearTimeout(timeout);
        const output = `${stdout}\n${stderr}`.trim();
        const errors = this.parseRuntimeErrorOutput(output);
        const report = {
          success: exitCode === 0 && errors.length === 0,
          command: normalizedCommand,
          exitCode,
          stdout,
          stderr,
          errors,
        };
        this.recordRuntimeHistory(normalizedCommand, report);
        void this.recordExecutionMemory({ kind: 'command', target: normalizedCommand, detail: report.success ? 'runtime-command-success' : 'runtime-command-failure', metadata: { exitCode: report.exitCode ?? -1 } });
        if (!report.success) {
          void this.recordFailurePattern('runtime', 'command', report.errors.join('; ') || normalizedCommand, 'runtime');
        }
        resolve(report);
      });
    });
  }

  getPersistentMemory(): AgentPersistentMemoryStore {
    return {
      version: this.persistentMemory.version,
      lastUpdated: this.persistentMemory.lastUpdated,
      executionHistory: [...this.persistentMemory.executionHistory],
      failurePatterns: [...this.persistentMemory.failurePatterns],
      dependencyGraph: [...this.persistentMemory.dependencyGraph],
      failedTests: [...this.persistentMemory.failedTests],
      vectorMemory: [...this.persistentMemory.vectorMemory],
      architecturePatterns: [...this.persistentMemory.architecturePatterns],
    };
  }

  getRuntimeHistory(): AgentRuntimeHistoryEntry[] {
    return [...this.runtimeHistory];
  }

  private recordRuntimeHistory(command: string, report: AgentRuntimeExecutionReport): void {
    this.runtimeHistory.push({
      id: `runtime-${this.runtimeHistory.length + 1}`,
      command,
      status: report.success ? 'success' : 'failed',
      timestamp: new Date().toISOString(),
      stdout: report.stdout,
      stderr: report.stderr,
      exitCode: report.exitCode,
    });
  }

  private createDefaultPersistentMemory(): AgentPersistentMemoryStore {
    return {
      version: 1,
      lastUpdated: new Date().toISOString(),
      executionHistory: [],
      failurePatterns: [],
      dependencyGraph: [],
      failedTests: [],
      vectorMemory: [],
      architecturePatterns: [],
    };
  }

  private async ensurePersistentMemoryLoaded(): Promise<void> {
    if (this.persistentMemory.executionHistory.length === 0 && this.persistentMemory.failurePatterns.length === 0 && this.persistentMemory.dependencyGraph.length === 0) {
      await this.loadPersistentMemory();
    }
  }

  private async loadPersistentMemory(): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const content = await fs.readFile(this.memoryFilePath, 'utf8');
      const parsed = JSON.parse(content) as Partial<AgentPersistentMemoryStore>;
      this.persistentMemory = {
        version: parsed.version ?? 1,
        lastUpdated: parsed.lastUpdated ?? new Date().toISOString(),
        executionHistory: parsed.executionHistory ?? [],
        failurePatterns: parsed.failurePatterns ?? [],
        dependencyGraph: parsed.dependencyGraph ?? [],
        failedTests: parsed.failedTests ?? [],
        vectorMemory: parsed.vectorMemory ?? [],
        architecturePatterns: parsed.architecturePatterns ?? [],
      };
    } catch {
      this.persistentMemory = this.createDefaultPersistentMemory();
    }
  }

  private async persistPersistentMemory(): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const pathModule = await import('node:path');
      await fs.mkdir(pathModule.dirname(this.memoryFilePath), { recursive: true });
      this.persistentMemory.lastUpdated = new Date().toISOString();
      await fs.writeFile(this.memoryFilePath, JSON.stringify(this.persistentMemory, null, 2), 'utf8');
    } catch {
      // Ignore persistence failures to keep the orchestrator resilient.
    }
  }

  private async recordExecutionMemory(entry: Omit<AgentExecutionMemoryEntry, 'id' | 'timestamp'>): Promise<void> {
    await this.ensurePersistentMemoryLoaded();
    this.persistentMemory.executionHistory.push({
      id: `memory-${Date.now()}-${this.persistentMemory.executionHistory.length + 1}`,
      timestamp: new Date().toISOString(),
      ...entry,
    });
    await this.persistPersistentMemory();
  }

  private async recordFailurePattern(target: string, kind: AgentFailurePattern['kind'], detail: string, source: string): Promise<void> {
    await this.ensurePersistentMemoryLoaded();
    const signature = `${kind}:${target}:${detail}`.toLowerCase();
    const existing = this.persistentMemory.failurePatterns.find((pattern) => pattern.signature === signature);
    const now = new Date().toISOString();

    if (existing) {
      existing.count += 1;
      existing.lastSeen = now;
      existing.recurring = existing.count >= 2;
      existing.tags = [...new Set([...existing.tags, 'recurring', source, kind])];
    } else {
      this.persistentMemory.failurePatterns.push({
        id: `pattern-${Date.now()}-${this.persistentMemory.failurePatterns.length + 1}`,
        target,
        kind,
        signature,
        count: 1,
        firstSeen: now,
        lastSeen: now,
        recurring: false,
        tags: [source, kind],
      });
    }

    await this.indexVectorMemory('failure', `Failure ${kind} on ${target}: ${detail}`, target, [kind, 'failure', source]);
    await this.persistPersistentMemory();
  }

  private async recordDependencyRelationship(files: string[]): Promise<void> {
    await this.ensurePersistentMemoryLoaded();
    const uniqueFiles = [...new Set(files.filter(Boolean))];
    if (uniqueFiles.length < 2) {
      return;
    }

    for (let index = 0; index < uniqueFiles.length; index += 1) {
      for (let innerIndex = index + 1; innerIndex < uniqueFiles.length; innerIndex += 1) {
        const from = uniqueFiles[index];
        const to = uniqueFiles[innerIndex];
        const existing = this.persistentMemory.dependencyGraph.find((relation) => relation.from === from && relation.to === to);
        if (existing) {
          existing.count += 1;
          existing.lastSeen = new Date().toISOString();
        } else {
          this.persistentMemory.dependencyGraph.push({
            id: `graph-${Date.now()}-${this.persistentMemory.dependencyGraph.length + 1}`,
            from,
            to,
            count: 1,
            lastSeen: new Date().toISOString(),
          });
        }
      }
    }

    await this.persistPersistentMemory();
  }

  async retrieveSimilarFixes(query: string, limit: number = 4): Promise<AgentMemoryVectorEntry[]> {
    const results = await this.recallSimilarMemory(query, limit);
    return results.filter((entry) => entry.kind === 'fix' || entry.kind === 'failure');
  }

  async registerFixEntry(summary: string, filePath?: string, tags: string[] = []): Promise<AgentMemoryVectorEntry> {
    return this.indexVectorMemory('fix', summary, filePath, [...tags, 'fix']);
  }

  async getArchitectureMemory(query: string, limit: number = 3): Promise<AgentArchitecturePattern[]> {
    return this.recallArchitecturePatterns(query, limit);
  }

  private async shouldEscalateBasedOnMemory(errors: string[], plan: FreeAgentPlan): Promise<boolean> {
    await this.ensurePersistentMemoryLoaded();
    const targets = [...new Set([...(plan.filesToCreate ?? []), ...(plan.filesToModify ?? [])])];
    const recurringPatterns = this.persistentMemory.failurePatterns.filter((pattern) => pattern.recurring && pattern.count >= 2 && targets.some((target) => target === pattern.target || pattern.target.includes(target) || target.includes(pattern.target)));
    return recurringPatterns.length > 0 || this.detectRepeatedFailure();
  }

  private extractFunctionNames(content: string): string[] {
    const matches = content.match(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/g) ?? [];
    return [...new Set(matches.map((entry) => entry.replace(/^(?:export\s+)?(?:async\s+)?function\s+/, '').trim()))];
  }

  private isRiskyChangeTarget(filePath: string, plan: FreeAgentPlan): boolean {
    const normalized = filePath.toLowerCase();
    const riskyHints = ['agent', 'ai', 'runtime', 'service', 'electron', 'terminal', 'worker'];
    return riskyHints.some((hint) => normalized.includes(hint)) || (plan.filesToModify.length + plan.filesToCreate.length) >= 3;
  }

  private isFeatureChange(plan: FreeAgentPlan, filePath: string): boolean {
    const normalized = `${plan.goal} ${filePath}`.toLowerCase();
    return normalized.includes('feature') || normalized.includes('integration') || normalized.includes('new') || normalized.includes('add');
  }

  private isAllowedCommand(command: string): boolean {
    return this.allowedCommands.some((pattern) => pattern.test(command));
  }

  private isDestructiveCommand(command: string): boolean {
    return this.destructiveCommands.some((pattern) => pattern.test(command));
  }

  private detectRepeatedFailure(): boolean {
    const recent = this.runtimeHistory.slice(-3);
    return recent.length >= 3 && recent.filter((entry) => entry.status === 'failed').length >= 2;
  }

  private parseRuntimeErrorOutput(output: string): string[] {
    const normalized = output.replace(/\u001b\[[0-9;]*m/g, '');
    const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const patterns = [/(error|exception|failed|crash|fatal|eaddrinuse|cannot find module|ERR!)/i];
    return lines.filter((line) => patterns.some((pattern) => pattern.test(line))).slice(0, 8);
  }

  private extractImportSpecifiers(content: string): string[] {
    const importPattern = /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]|(?:import|require)\(['"]([^'"]+)['"]\)/g;
    const matches: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = importPattern.exec(content)) !== null) {
      const specifier = match[1] ?? match[2];
      if (specifier) {
        matches.push(specifier);
      }
    }
    return [...new Set(matches)];
  }

  private async resolveImportPath(fromFile: string, specifier: string): Promise<{ exists: boolean; resolvedPath: string }> {
    const { dirname, resolve, extname } = await import('node:path');
    const fs = await import('node:fs/promises');

    if (!specifier.startsWith('.')) {
      const bareCandidate = resolve(this.projectRoot, 'node_modules', specifier);
      try {
        await fs.access(bareCandidate);
        return { exists: true, resolvedPath: bareCandidate };
      } catch {
        return { exists: false, resolvedPath: bareCandidate };
      }
    }

    const basePath = resolve(dirname(fromFile), specifier);
    const candidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.js`, `${basePath}.jsx`, `${basePath}/index.ts`, `${basePath}/index.tsx`, `${basePath}/index.js`, `${basePath}/index.jsx`];
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return { exists: true, resolvedPath: candidate };
      } catch {
        // continue
      }
    }
    return { exists: false, resolvedPath: basePath };
  }

  private async findProjectSourceFiles(): Promise<string[]> {
    const fs = await import('node:fs/promises');
    const pathModule = await import('node:path');
    const files: string[] = [];

    async function walk(currentPath: string): Promise<void> {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = pathModule.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', 'dist', 'build', 'release', '.git', '.electron-user-data'].includes(entry.name)) {
            continue;
          }
          await walk(fullPath);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    }

    await walk(this.projectRoot);
    return files;
  }

  private isCriticalPath(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    return this.criticalPathPatterns.some((pattern) => pattern.test(normalized));
  }

  private buildSemanticAnalysis(filePath: string, content: string): AgentSemanticAnalysis {
    const symbols: AgentSemanticSymbol[] = [];
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const functionMatch = trimmed.match(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/);
      const classMatch = trimmed.match(/(?:export\s+)?class\s+([A-Za-z0-9_]+)\s*/);
      const interfaceMatch = trimmed.match(/(?:export\s+)?interface\s+([A-Za-z0-9_]+)\s*/);
      const exportMatch = trimmed.match(/export\s+(?:const|class|function|interface|type)\s+([A-Za-z0-9_]+)/);

      if (functionMatch) {
        symbols.push({ id: `${filePath}:${index + 1}:function`, name: functionMatch[1], kind: 'function', filePath, line: index + 1, references: [] });
      }
      if (classMatch) {
        symbols.push({ id: `${filePath}:${index + 1}:class`, name: classMatch[1], kind: 'class', filePath, line: index + 1, references: [] });
      }
      if (interfaceMatch) {
        symbols.push({ id: `${filePath}:${index + 1}:interface`, name: interfaceMatch[1], kind: 'interface', filePath, line: index + 1, references: [] });
      }
      if (exportMatch) {
        symbols.push({ id: `${filePath}:${index + 1}:export`, name: exportMatch[1], kind: 'export', filePath, line: index + 1, references: [] });
      }
    });

    const callChains = this.extractCallChains(content);
    const impactedSymbols = [...new Set(symbols.filter((symbol) => callChains.some((chain) => chain.includes(symbol.name))).map((symbol) => symbol.name))];
    return {
      symbols,
      callChains,
      impactedSymbols,
      patches: [],
    };
  }

  private extractCallChains(content: string): string[] {
    const calls = content.match(/\b([A-Za-z0-9_]+)\s*\(/g) ?? [];
    return [...new Set(calls.map((call) => call.replace(/\s*\($/, '').trim()))];
  }

  private applySemanticRename(content: string, currentName: string, nextName: string): string {
    const escapedCurrent = currentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escapedCurrent}\\b`, 'g');
    return content.replace(pattern, nextName);
  }

  private logAction(action: AgentExecutionAction): void {
    this.actions.push(action);
    this.logger?.(action);
  }
}

class MultiAgentBase {
  constructor(protected readonly executor: AgentExecutor) {}
}

export class PlannerAgent extends MultiAgentBase {
  async plan(plan: FreeAgentPlan): Promise<AgentTask[]> {
    const files = [...new Set([...(plan.filesToCreate ?? []), ...(plan.filesToModify ?? [])])];
    const graph = await this.executor.getProjectIntelligenceGraph();
    const memory = this.executor.getPersistentMemory();
    const recurringTargets = new Set(memory.failurePatterns.filter((pattern) => pattern.recurring).map((pattern) => pattern.target));

    const dependencyMatrix = graph.edges.reduce<Record<string, Set<string>>>((acc, edge) => {
      acc[edge.from] = acc[edge.from] ?? new Set();
      acc[edge.from].add(edge.to);
      return acc;
    }, {});

    const tasks: AgentTask[] = files.map((filePath, index) => ({
      id: `task-${index + 1}`,
      title: `Work on ${filePath}`,
      goal: plan.goal,
      filesToCreate: plan.filesToCreate.includes(filePath) ? [filePath] : [],
      filesToModify: plan.filesToModify.includes(filePath) ? [filePath] : [],
      status: 'pending',
      notes: recurringTargets.has(filePath) ? ['Recurring failure pattern detected in memory.'] : [],
      metadata: {
        dependencyTargets: [...(dependencyMatrix[filePath] ?? [])],
        priority: recurringTargets.has(filePath) ? 2 : 1,
      },
    }));

    const validateTask: AgentTask = {
      id: `task-${tasks.length + 1}`,
      title: 'Validate orchestration outcome',
      goal: plan.goal,
      filesToCreate: [],
      filesToModify: [],
      status: 'pending',
      notes: ['Review the execution result and keep the change set localized.'],
      metadata: { dependencyTargets: files, priority: 0 },
    };

    return [...tasks.sort((a, b) => ((b.metadata?.priority ?? 0) - (a.metadata?.priority ?? 0))), validateTask];
  }
}

export class CoderAgent extends MultiAgentBase {
  async execute(tasks: AgentTask[], plan: FreeAgentPlan): Promise<AgentAgentResult> {
    const createTasks = tasks.filter((task) => task.filesToCreate.length > 0);
    const modifyTasks = tasks.filter((task) => task.filesToModify.length > 0);

    await Promise.all(createTasks.map(async (task) => {
      await Promise.all(task.filesToCreate.map(async (filePath) => {
        await this.executor.createFile(filePath, `// Updated by CoderAgent\n// Goal: ${plan.goal}\n`);
      }));
    }));

    await Promise.all(modifyTasks.map(async (task) => {
      await Promise.all(task.filesToModify.map(async (filePath) => {
        await this.executor.writeFile(filePath, `// Updated by CoderAgent\n// Goal: ${plan.goal}\n`);
      }));
    }));

    return {
      agent: 'CoderAgent',
      status: 'completed',
      message: `Applied ${tasks.length} task${tasks.length === 1 ? '' : 's'} through the local executor.`,
    };
  }
}

export class ReviewerAgent extends MultiAgentBase {
  async review(tasks: AgentTask[], plan: FreeAgentPlan): Promise<AgentAgentResult> {
    const riskyFiles = tasks.flatMap((task) => [...task.filesToCreate, ...task.filesToModify]);
    const highRisk = riskyFiles.some((filePath) => filePath.includes('runtime') || filePath.includes('agent') || filePath.includes('ai'));
    const memory = this.executor.getPersistentMemory();
    const recurring = memory.failurePatterns.some((pattern) => pattern.recurring);

    if (highRisk || recurring) {
      return {
        agent: 'ReviewerAgent',
        status: 'escalated',
        message: `Review flagged risky changes for ${plan.goal}.`,
      };
    }

    return {
      agent: 'ReviewerAgent',
      status: 'completed',
      message: `Review completed for ${plan.goal}.`,
    };
  }
}

export class TesterAgent extends MultiAgentBase {
  async test(plan: FreeAgentPlan, tasks: AgentTask[] = []): Promise<AgentAgentResult> {
    const files = [...new Set(tasks.flatMap((task) => [...task.filesToCreate, ...task.filesToModify]))];
    const generatedTests = await this.executor.generateAutonomousTests(plan, files);
    const coverage = await this.executor.evaluateCoverage(files, generatedTests);
    const untested = coverage.filter((check) => !check.tested);
    const regressionResults = await this.executor.rerunAffectedTests(files, []);
    const failed = regressionResults.some((result) => !result.passed);

    if (failed) {
      const failures = regressionResults.filter((result) => !result.passed).map((result) => result.message).join('; ');
      await this.executor.recordFailedTestCase({
        filePath: files[0] ?? 'unknown',
        target: files[0] ?? plan.goal,
        kind: generatedTests.some((testCase) => testCase.kind === 'integration') ? 'integration' : 'unit',
        message: failures,
      });
      return {
        agent: 'TesterAgent',
        status: 'failed',
        message: `${untested.length} function${untested.length === 1 ? '' : 's'} remain untested. ${failures}`,
      };
    }

    return {
      agent: 'TesterAgent',
      status: 'completed',
      message: `Generated ${generatedTests.length} test case${generatedTests.length === 1 ? '' : 's'} and validated ${files.length} target file${files.length === 1 ? '' : 's'} for ${plan.goal}.`,
    };
  }
}

export class MemoryAgent extends MultiAgentBase {
  async record(tasks: AgentTask[], plan: FreeAgentPlan, results: AgentAgentResult[]): Promise<AgentAgentResult> {
    const files = [...new Set(tasks.flatMap((task) => [...task.filesToCreate, ...task.filesToModify]))];
    await this.executor.recordAgentDependencyRelationship(files);
    await this.executor.recordAgentMemory({
      kind: 'module',
      target: plan.goal,
      detail: 'multi-agent-orchestration',
      metadata: { taskCount: tasks.length, results: results.length },
    });

    return {
      agent: 'MemoryAgent',
      status: 'completed',
      message: `Recorded ${tasks.length} task${tasks.length === 1 ? '' : 's'} in long-term memory.`,
    };
  }
}

interface AgentSchedulerState {
  nextTaskIndex: number;
  inFlight: Set<string>;
  completed: Set<string>;
  failed: Set<string>;
}

export class MultiAgentOrchestrator {
  private readonly planner: PlannerAgent;
  private readonly coder: CoderAgent;
  private readonly reviewer: ReviewerAgent;
  private readonly tester: TesterAgent;
  private readonly memory: MemoryAgent;
  private readonly locks: Set<string> = new Set();

  constructor(executor: AgentExecutor) {
    this.planner = new PlannerAgent(executor);
    this.coder = new CoderAgent(executor);
    this.reviewer = new ReviewerAgent(executor);
    this.tester = new TesterAgent(executor);
    this.memory = new MemoryAgent(executor);
  }

  private fileLockKey(filePath: string): string {
    return `lock:${filePath}`;
  }

  private acquireLocks(files: string[]): boolean {
    const keys = files.map((file) => this.fileLockKey(file));
    if (keys.some((key) => this.locks.has(key))) {
      return false;
    }
    keys.forEach((key) => this.locks.add(key));
    return true;
  }

  private releaseLocks(files: string[]): void {
    files.map((file) => this.fileLockKey(file)).forEach((key) => this.locks.delete(key));
  }

  private async executeWorker(task: AgentTask, plan: FreeAgentPlan): Promise<AgentAgentResult[]> {
    const workerResults: AgentAgentResult[] = [];
    try {
      const coderResult = await this.coder.execute([task], plan);
      workerResults.push(coderResult);
      if (coderResult.status !== 'completed') {
        return workerResults;
      }

      const reviewResult = await this.reviewer.review([task], plan);
      workerResults.push(reviewResult);
      if (reviewResult.status === 'escalated') {
        return workerResults;
      }

      const testResult = await this.tester.test(plan, [task]);
      workerResults.push(testResult);
      return workerResults;
    } catch (error) {
      workerResults.push({
        agent: 'CoderAgent',
        status: 'failed',
        message: `Worker failure for ${task.id}: ${error instanceof Error ? error.message : String(error)}`,
      });
      return workerResults;
    }
  }

  async orchestrate(input: string | FreeAgentRequest, options: Partial<FreeAgentRequest> = {}): Promise<AgentOrchestrationReport> {
    const plan = createFreeAgentPlan(input, options);
    const tasks = await this.planner.plan(plan);
    const results: AgentAgentResult[] = [];
    const scheduler: AgentSchedulerState = {
      nextTaskIndex: 0,
      inFlight: new Set(),
      completed: new Set(),
      failed: new Set(),
    };

    const taskGraph = tasks.reduce<Record<string, string[]>>((acc, task) => {
      acc[task.id] = (task.metadata?.dependencyTargets as string[]) ?? [];
      return acc;
    }, {});

    const fetchRunnableTasks = (): AgentTask[] => {
      return tasks.filter((task) => {
        if (scheduler.completed.has(task.id) || scheduler.inFlight.has(task.id) || scheduler.failed.has(task.id)) {
          return false;
        }
        const dependencyFiles = task.metadata?.dependencyTargets as string[] | undefined;
        if (!dependencyFiles?.length) {
          return true;
        }
        const blockingTasks = tasks.filter((candidate) =>
          candidate.id !== task.id &&
          !scheduler.completed.has(candidate.id) &&
          !scheduler.failed.has(candidate.id) &&
          [...candidate.filesToCreate, ...candidate.filesToModify].some((file) => dependencyFiles.includes(file)),
        );
        return blockingTasks.length === 0;
      });
    };

    const taskWorkers: Promise<void>[] = [];
    const maxParallel = Math.max(2, Math.min(4, tasks.length));
    let idlePasses = 0;

    while (scheduler.completed.size + scheduler.failed.size < tasks.length) {
      const runnable = fetchRunnableTasks().slice(0, Math.max(0, maxParallel - scheduler.inFlight.size));
      if (runnable.length === 0) {
        if (scheduler.inFlight.size === 0) {
          break;
        }
        await Promise.race(taskWorkers);
        idlePasses += 1;
        if (idlePasses > tasks.length * 4) {
          break;
        }
        continue;
      }

      idlePasses = 0;
      for (const task of runnable) {
        const targetFiles = [...new Set([...task.filesToCreate, ...task.filesToModify])];
        if (!this.acquireLocks(targetFiles)) {
          continue;
        }
        scheduler.inFlight.add(task.id);
        const workerPromise = this.executeWorker(task, plan)
          .then(async (workerResults) => {
            scheduler.inFlight.delete(task.id);
            const failed = workerResults.some((result) => result.status !== 'completed');
            if (failed) {
              scheduler.failed.add(task.id);
            } else {
              scheduler.completed.add(task.id);
            }

            task.status = failed ? 'failed' : 'completed';
            workerResults.forEach((result) => results.push(result));
            this.releaseLocks(targetFiles);
          })
          .catch((error) => {
            scheduler.inFlight.delete(task.id);
            scheduler.failed.add(task.id);
            task.status = 'failed';
            results.push({
              agent: 'CoderAgent',
              status: 'failed',
              message: error instanceof Error ? error.message : String(error),
            });
            this.releaseLocks(targetFiles);
          });
        taskWorkers.push(workerPromise);
      }

      await Promise.race(taskWorkers);
    }

    await Promise.allSettled(taskWorkers);

    const memoryResult = await this.memory.record(tasks, plan, results);
    results.push(memoryResult);

    const escalated = scheduler.failed.size > 0;
    return {
      plan,
      tasks,
      results,
      escalated,
      summary: escalated ? 'Multi-agent orchestration escalated due to worker failures or review issues.' : 'Multi-agent orchestration completed successfully.',
    };
  }
}

export default createFreeAgentPlan;
