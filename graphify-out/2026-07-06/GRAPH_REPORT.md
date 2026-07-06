# Graph Report - otel_ai  (2026-07-06)

## Corpus Check
- 51 files · ~24,266 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 374 nodes · 458 edges · 35 communities (21 shown, 14 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `37e56501`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Raw Telemetry Dashboard|Raw Telemetry Dashboard]]
- [[_COMMUNITY_Backend Ingestion and Database|Backend Ingestion and Database]]
- [[_COMMUNITY_Conversation Detail View|Conversation Detail View]]
- [[_COMMUNITY_Backend Configuration and Dependencies|Backend Configuration and Dependencies]]
- [[_COMMUNITY_Frontend Build and Configuration|Frontend Build and Configuration]]
- [[_COMMUNITY_Conversation Sidebar and Dashboard|Conversation Sidebar and Dashboard]]
- [[_COMMUNITY_Telemetry Detail and JSON Viewer|Telemetry Detail and JSON Viewer]]
- [[_COMMUNITY_Frontend App Root and Settings|Frontend App Root and Settings]]
- [[_COMMUNITY_OTel Telemetry Resolvers|OTel Telemetry Resolvers]]
- [[_COMMUNITY_Workspace Configuration and Docs|Workspace Configuration and Docs]]
- [[_COMMUNITY_Frontend Node TSConfig|Frontend Node TSConfig]]
- [[_COMMUNITY_Model Cost Settings|Model Cost Settings]]
- [[_COMMUNITY_Backend TSConfig|Backend TSConfig]]
- [[_COMMUNITY_Frontend App TSConfig|Frontend App TSConfig]]
- [[_COMMUNITY_Frontend Workspace TSConfig|Frontend Workspace TSConfig]]
- [[_COMMUNITY_Frontend Icons Asset|Frontend Icons Asset]]
- [[_COMMUNITY_📄 Product Requirements Document (PRD)|📄 Product Requirements Document (PRD)]]
- [[_COMMUNITY_VS Code Copilot Chat OTel Auditing & Reporting System|VS Code Copilot Chat OTel Auditing & Reporting System]]
- [[_COMMUNITY_graphify|graphify.md]]
- [[_COMMUNITY_graphify|graphify.md]]
- [[_COMMUNITY_README|README.md]]
- [[_COMMUNITY_Cost Management and CRUD Module|Cost Management and CRUD Module]]
- [[_COMMUNITY_Ingestion and Data Persistence Architecture|Ingestion and Data Persistence Architecture]]
- [[_COMMUNITY_Export and Maintenance Features|Export and Maintenance Features]]
- [[_COMMUNITY_Product Overview|Product Overview]]
- [[_COMMUNITY_Phased Implementation Plan|Phased Implementation Plan]]
- [[_COMMUNITY_Processing Logic and Calculation Engine|Processing Logic and Calculation Engine]]
- [[_COMMUNITY_Product Requirements Document|Product Requirements Document]]
- [[_COMMUNITY_User Interface Design|User Interface Design]]
- [[_COMMUNITY_Project Architecture|Project Architecture]]

## God Nodes (most connected - your core abstractions)
1. `Vue SVG Logo` - 19 edges
2. `compilerOptions` - 15 edges
3. `compilerOptions` - 12 edges
4. `logger` - 10 edges
5. `📄 Product Requirements Document (PRD)` - 9 edges
6. `scripts` - 8 edges
7. `db` - 8 edges
8. `VS Code Copilot Chat OTel Auditing & Reporting System` - 8 edges
9. `findAttribute()` - 7 edges
10. `compilerOptions` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Vite SVG Logo` --conceptually_related_to--> `Frontend Index HTML`  [INFERRED]
  packages/frontend/src/assets/vite.svg → packages/frontend/index.html
- `Vue SVG Logo` --conceptually_related_to--> `Frontend Index HTML`  [INFERRED]
  packages/frontend/src/assets/vue.svg → packages/frontend/index.html
- `Frontend Index HTML` --references--> `Favicon SVG`  [EXTRACTED]
  packages/frontend/index.html → packages/frontend/public/favicon.svg
- `getTelemetryResolver()` --calls--> `getAttributeValue()`  [EXTRACTED]
  packages/backend/src/services/telemetry/resolvers.ts → packages/backend/src/services/telemetry/helpers.ts

## Import Cycles
- None detected.

## Communities (35 total, 14 thin omitted)

### Community 0 - "Raw Telemetry Dashboard"
Cohesion: 0.17
Nodes (8): ModelCostBreakdown, chartData, chartOptions, colorsPalette, hasData, props, props, totals

### Community 1 - "Backend Ingestion and Database"
Cohesion: 0.16
Nodes (13): db, __dirname, envPath, __filename, runMigrations(), app, router, router (+5 more)

### Community 2 - "Conversation Detail View"
Cohesion: 0.07
Nodes (18): copyMarkdown(), editTitleVal, filteredBreakdown, filteredSpans, formatDate(), hasUnconfiguredRates, isCopying, isDeleting (+10 more)

### Community 3 - "Backend Configuration and Dependencies"
Cohesion: 0.08
Nodes (25): dependencies, better-sqlite3, cors, dotenv, express, pino, pino-http, devDependencies (+17 more)

### Community 4 - "Frontend Build and Configuration"
Cohesion: 0.08
Nodes (22): dependencies, chart.js, pinia, vue, vue-chartjs, vue-router, devDependencies, @types/node (+14 more)

### Community 5 - "Conversation Sidebar and Dashboard"
Cohesion: 0.10
Nodes (14): Hero Image, hasSubagents, isExpanded, isSelected, orchestratorAgent, props, relativeTime, shortId (+6 more)

### Community 6 - "Telemetry Detail and JSON Viewer"
Cohesion: 0.06
Nodes (23): Frontend Index HTML, Favicon SVG, RawTelemetryDetail, RawTelemetrySummary, Vue SVG Logo, formattedValue, isArray, isCopying (+15 more)

### Community 7 - "Frontend App Root and Settings"
Cohesion: 0.12
Nodes (14): app, pinia, router, DbStat, error, fetchDbStat(), handleReprocess(), loading (+6 more)

### Community 8 - "OTel Telemetry Resolvers"
Cohesion: 0.17
Nodes (7): extractPromptFromRequest(), findAttribute(), getAttributeValue(), CopilotCliTelemetryResolver, getTelemetryResolver(), TelemetryResolver, VSCodeTelemetryResolver

### Community 9 - "Workspace Configuration and Docs"
Cohesion: 0.14
Nodes (12): engines, node, name, private, scripts, build:backend, build:frontend, dev (+4 more)

### Community 10 - "Frontend Node TSConfig"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 11 - "Model Cost Settings"
Cohesion: 0.08
Nodes (21): api, AtomicSpan, Conversation, ConversationDetail, ConversationRawTelemetry, ConversationsResponse, ModelCost, ModelRate (+13 more)

### Community 12 - "Backend TSConfig"
Cohesion: 0.13
Nodes (14): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir, resolveJsonModule (+6 more)

### Community 13 - "Frontend App TSConfig"
Cohesion: 0.20
Nodes (9): compilerOptions, erasableSyntaxOnly, noFallthroughCasesInSwitch, noUnusedLocals, noUnusedParameters, tsBuildInfoFile, types, extends (+1 more)

### Community 20 - "📄 Product Requirements Document (PRD)"
Cohesion: 0.09
Nodes (22): 1. Product Overview, 2. Ingestion and Data Persistence Architecture, 3. Processing Logic and Calculation Engine (Core), 4. Cost Management and CRUD Module, 5. User Interface Design (Vue Frontend), 6. Export and Maintenance Features, 7. Phased Implementation Plan, 🤖 Automatic Model Discovery (Auto-discovery) (+14 more)

### Community 21 - "VS Code Copilot Chat OTel Auditing & Reporting System"
Cohesion: 0.10
Nodes (19): 1. Installation, 2. Configure Environment, 📡 API Endpoints, Backend Server, 💬 Conversations & Spans Querying, Frontend UI, 🚀 Getting Started, 🔌 Ingestion & Utility Endpoints (+11 more)

## Knowledge Gaps
- **209 isolated node(s):** `name`, `private`, `node`, `dev`, `dev:backend` (+204 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Vue SVG Logo` connect `Telemetry Detail and JSON Viewer` to `Raw Telemetry Dashboard`, `Conversation Detail View`, `Frontend Build and Configuration`, `Conversation Sidebar and Dashboard`, `Frontend App Root and Settings`, `Model Cost Settings`?**
  _High betweenness centrality (0.228) - this node is a cross-community bridge._
- **Why does `vue` connect `Frontend Build and Configuration` to `Telemetry Detail and JSON Viewer`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **What connects `name`, `private`, `node` to the rest of the system?**
  _209 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Conversation Detail View` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Backend Configuration and Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `Frontend Build and Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `Conversation Sidebar and Dashboard` be split into smaller, more focused modules?**
  _Cohesion score 0.09956709956709957 - nodes in this community are weakly interconnected._