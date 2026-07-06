# Graph Report - .  (2026-07-06)

## Corpus Check
- Corpus is ~24,021 words - fits in a single context window. You may not need a graph.

## Summary
- 327 nodes · 431 edges · 20 communities (18 shown, 2 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `Vue SVG Logo` - 19 edges
2. `compilerOptions` - 15 edges
3. `compilerOptions` - 12 edges
4. `logger` - 10 edges
5. `scripts` - 8 edges
6. `db` - 8 edges
7. `findAttribute()` - 7 edges
8. `compilerOptions` - 7 edges
9. `Product Requirements Document` - 7 edges
10. `TelemetryResolver` - 6 edges

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

## Communities (20 total, 2 thin omitted)

### Community 0 - "Raw Telemetry Dashboard"
Cohesion: 0.06
Nodes (30): Frontend Index HTML, Favicon SVG, AtomicSpan, ConversationRawTelemetry, ConversationsResponse, ModelCostBreakdown, ModelRate, RawTelemetryDetail (+22 more)

### Community 1 - "Backend Ingestion and Database"
Cohesion: 0.11
Nodes (21): db, __dirname, envPath, __filename, runMigrations(), app, router, router (+13 more)

### Community 2 - "Conversation Detail View"
Cohesion: 0.07
Nodes (18): copyMarkdown(), editTitleVal, filteredBreakdown, filteredSpans, formatDate(), hasUnconfiguredRates, isCopying, isDeleting (+10 more)

### Community 3 - "Backend Configuration and Dependencies"
Cohesion: 0.08
Nodes (25): dependencies, better-sqlite3, cors, dotenv, express, pino, pino-http, devDependencies (+17 more)

### Community 4 - "Frontend Build and Configuration"
Cohesion: 0.08
Nodes (23): dependencies, chart.js, pinia, vue, vue-chartjs, vue-router, devDependencies, @types/node (+15 more)

### Community 5 - "Conversation Sidebar and Dashboard"
Cohesion: 0.10
Nodes (16): Conversation, ConversationDetail, Hero Image, hasSubagents, isExpanded, isSelected, orchestratorAgent, props (+8 more)

### Community 6 - "Telemetry Detail and JSON Viewer"
Cohesion: 0.10
Nodes (11): formattedValue, isArray, isCopying, isExpanded, isObject, props, typeofValue, isCopying (+3 more)

### Community 7 - "Frontend App Root and Settings"
Cohesion: 0.12
Nodes (14): app, pinia, router, DbStat, error, fetchDbStat(), handleReprocess(), loading (+6 more)

### Community 8 - "OTel Telemetry Resolvers"
Cohesion: 0.17
Nodes (7): extractPromptFromRequest(), findAttribute(), getAttributeValue(), CopilotCliTelemetryResolver, getTelemetryResolver(), TelemetryResolver, VSCodeTelemetryResolver

### Community 9 - "Workspace Configuration and Docs"
Cohesion: 0.12
Nodes (14): engines, node, name, private, scripts, build:backend, build:frontend, dev (+6 more)

### Community 10 - "Frontend Node TSConfig"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 11 - "Model Cost Settings"
Cohesion: 0.14
Nodes (9): api, ModelCost, useModelCostsStore, addError, editForm, editingModelName, newModelForm, showAddForm (+1 more)

### Community 12 - "Backend TSConfig"
Cohesion: 0.13
Nodes (14): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir, resolveJsonModule (+6 more)

### Community 13 - "Frontend App TSConfig"
Cohesion: 0.20
Nodes (9): compilerOptions, erasableSyntaxOnly, noFallthroughCasesInSwitch, noUnusedLocals, noUnusedParameters, tsBuildInfoFile, types, extends (+1 more)

## Knowledge Gaps
- **173 isolated node(s):** `name`, `private`, `node`, `dev`, `dev:backend` (+168 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Vue SVG Logo` connect `Raw Telemetry Dashboard` to `Conversation Detail View`, `Frontend Build and Configuration`, `Conversation Sidebar and Dashboard`, `Telemetry Detail and JSON Viewer`, `Frontend App Root and Settings`, `Model Cost Settings`?**
  _High betweenness centrality (0.460) - this node is a cross-community bridge._
- **Why does `vue` connect `Frontend Build and Configuration` to `Raw Telemetry Dashboard`?**
  _High betweenness centrality (0.239) - this node is a cross-community bridge._
- **What connects `name`, `private`, `node` to the rest of the system?**
  _173 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Raw Telemetry Dashboard` be split into smaller, more focused modules?**
  _Cohesion score 0.06025369978858351 - nodes in this community are weakly interconnected._
- **Should `Backend Ingestion and Database` be split into smaller, more focused modules?**
  _Cohesion score 0.112375533428165 - nodes in this community are weakly interconnected._
- **Should `Conversation Detail View` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Backend Configuration and Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._