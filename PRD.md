# 📄 Product Requirements Document (PRD)

## Local Token Auditing and Reporting System for VS Code Copilot Chat

## 1. Product Overview

The goal of this system is to locally intercept, persist, and analyze telemetry metrics emitted by **VS Code Copilot Chat**, **Copilot CLI**, and **Opencode**. The system acts as an autonomous OTLP/HTTP collector to accurately process token usage and costs (broken down by model) for both standard and complex (multi-agent) interactions.

### 💻 Selected Tech Stack

* **Backend:** Node.js, TypeScript, Express, and seamless execution via `tsx`.
* **Package Manager:** `pnpm` (focused on speed and secure, flat-tree dependencies).
* **Database:** SQLite (lightweight, local, and embedded).
* **Frontend:** Vue.js 3 (reactive, clean, and interactive interface).

---

## 2. Ingestion and Data Persistence Architecture

The system will operate in a **100% local, single-user** manner, running on the developer's machine to guarantee maximum privacy for the sent code and prompts.

### 🔌 Ingestion Endpoint (Webhook)

* Expose a `POST /v1/traces` endpoint running on OpenTelemetry's default local port (`4318`).
* Configure a **50MB** payload limit on Express middleware to prevent crashes caused by large source code capture payloads.

### 🗄️ Database Schema (SQLite)

To shield the system against schema changes and guarantee performance, the database is structured as follows:

1. **Raw Telemetry Table (`raw_telemetry`):**
   * Stores the complete JSON payload exactly as received from the OTLP protocol.
   * Fields: `id` (Autoincrement), `conversation_id` (TEXT, Nullable), `payload` (TEXT/JSON), `created_at` (Timestamp/Integer).

2. **Processed Tables (Relaxed Relational Schema):**
   * `conversations`: Stores unique session identifiers, title, source, first and last seen timestamps.
     * Fields: `id` (PK, TEXT), `title` (TEXT, Nullable), `first_seen_at` (INTEGER), `last_seen_at` (INTEGER), `source` (TEXT, e.g., `'vscode'`, `'copilot-cli'`, `'opencode'`).
   * `atomic_spans`: Stores flat records of AI execution nodes containing token metrics.
     * Fields: `id` (PK, TEXT), `conversation_id` (TEXT, FK), `model_name` (TEXT, FK), `agent_name` (TEXT, Nullable), `raw_telemetry_id` (INTEGER, Nullable), `input_tokens` (INTEGER), `output_tokens` (INTEGER), `cache_read_tokens` (INTEGER), `cache_write_tokens` (INTEGER), `reasoning_tokens` (INTEGER), `created_at` (INTEGER).

---

## 3. Processing Logic and Calculation Engine (Core)

The analytical engine in the backend avoids reconstructing complex hierarchical or parent-child orchestration trees. Instead, it delegates trace parsing to source-specific telemetry resolvers.

### 🔌 Telemetry Resolvers Architecture

The parser maps OTel traces based on the `service.name` resource attribute to one of the following resolvers:

1. **`VSCodeTelemetryResolver` (`copilot-chat` / `vscode`):**
   * Targets leaf nodes where the span name starts with `"chat"`.
   * Maps parent-child session IDs using session aliasing to attribute subagent spans to their orchestrator session.
   * Extracts input, output, cache read, cache write, and reasoning tokens.

2. **`CopilotCliTelemetryResolver` (`github-copilot` / `copilot-cli`):**
   * Targets `chat` spans and non-nested `invoke_agent` spans to prevent double-counting.
   * Performs agent/subagent classification and formats them for database query routing.

3. **`OpencodeTelemetryResolver` (`opencode`):**
   * Targets `ai.streamText` spans.
   * Extracts conversation titles by detecting dedicated title generator spans (`ai.streamText` with prompts containing `'title generator'` or `'thread title'`).
   * Extracts prompts from user messages and tracks parent-child session relationships (aliasing) and subagent type mapping by parsing `ai.toolCall` payloads.

### 🧠 Flat Extraction and Resolution Strategy

* **Session Aliasing:** Maps subagent or client child sessions back to the parent session ID so all associated tokens are aggregated under a single unified conversation in the dashboard.
* **Subagent Name Mapping:** Maps generated task/subagent runs to their respective logical subagent types (e.g., specific agent personas or tasks).
* **Token Extraction:** Standardizes the extraction of input, output, cache read, cache write, and reasoning tokens across the varying attribute formats used by different IDE extensions and clients.

---

## 4. Cost Management and CRUD Module

### 📊 Relational Cost Table (`model_costs`)

The system maintains a dedicated SQLite table to map financial processing rates:

* **Primary Key / ID:** `model_name` (Must match exactly the identifier string injected by OTel, e.g., `gpt-4o`).
* **Columns:** `input_cost_per_m`, `output_cost_per_m`, `cache_read_cost_per_m`, `cache_write_cost_per_m`, `reasoning_cost_per_m` (All represented numerically based on cost per 1 million tokens).

### 🤖 Automatic Model Discovery (Auto-discovery)

* If the webhook processes a span with a model that does not exist in the `model_costs` table, the backend performs an **automatic hot insertion** with rates initialized to `$0.00`.
* The backend will expose a **full REST API (CRUD)** at `/api/model-costs` so the frontend can read, update, or delete these rates directly.

---

## 5. User Interface Design (Vue Frontend)

The interface will center around a dynamic **Split View (Master-Detail)** layout optimized for agile analysis.

```
+------------------------------------+-------------------------------------------+
| [Search chat / model...          ] | Conversation: id-conv-12345               |
| ---------------------------------- | ----------------------------------------- |
| 💬 Conv #12345                      | [X] gpt-4o   [X] claude-3-5-sonnet        |
|    Models: GPT-4o, Claude 3.5      | ----------------------------------------- |
|    2 hours ago                     | 🟩 Input: 52K   🟦 Output: 12K            |
| ---------------------------------- | 🟨 Cache: 24K   🟧 Reasoning: 2.1K        |
| ---------------------------------- | ----------------------------------------- |
| 💬 Conv #11290                      |   [ Donut Chart: ]    [ Bar Chart: ]      |
|    Models: GPT-4o                  |   Cost Distribution   Token Consumption   |
|    Yesterday                       |   by Model            Over Time           |
+------------------------------------+-------------------------------------------+
```

### 🎛️ Key UI Components

* **Left Panel (History):** A chronological list of conversations, filterable by session identifier or the models involved.
* **Interactive Filtering Pills:** Checkboxes at the top listing models detected in the current session. Unchecking a model triggers Vue's `computed properties` to instantly recalculate charts and metrics on the client.
* **KPI Cards:** Four large numeric displays with smooth transitions for Input, Output, Cache, and Reasoning token counts.
* **Dynamic Charts:** Integration of a lightweight library (e.g., Chart.js) to render a pie/donut chart for cost breakdown and a sequential bar chart for the conversation timeline.
* **New Model Alert:** If a model enters at `$0.00` cost due to auto-discovery, a warning badge (`⚠️ Cost not configured`) will appear with a direct link to the CRUD form to fill in the rate details.

---

## 6. Export and Maintenance Features

### 📋 Dual Portable Export System

Each individual conversation will feature an export menu generating a structured report:

* **Content:** An executive summary detailing tokens (Input, Output, Cache, Reasoning) **strictly grouped by model** to facilitate external audit calculations, plus an estimated financial savings metric from caching.
* **Formats:**
  1. **Markdown (`.md`):** Formatted plain text ready to copy-paste into a pull request or engineering channel.
  2. **PDF / Print:** Optimized CSS media stylesheet (`@media print`) to trigger the web browser's native print-to-PDF functionality cleanly and visually.

### 🧹 Lifecycle and Data Cleanup

* **Controlled Manual Purge:** No destructive background tasks run automatically. The Vue UI provides explicit, confirmation-guarded actions:
  1. **Purge Raw History:** Delete raw telemetry logs older than `N` days.
  2. **Telemetry Without Tokens Cleanup:** Clean up and delete all historical raw telemetry records, atomic spans, and empty conversations that have zero token consumption.
* **Storage Optimization:** These cleanups execute a transaction on SQLite followed by SQLite's `VACUUM` command to reclaim actual user disk space.
* **Space Monitoring:** The backend will use Node.js's native `fs.stat` API to return the actual file size of the `.db` file in megabytes/gigabytes, displaying it prominently on the configuration dashboard.

---

## 7. Phased Implementation Plan

To ensure a structured and iterative development process, the system implementation is broken down into four distinct phases:

### Phase 1: Ingestion Endpoint & Local Database Setup (Weeks 1-2)
* **Express Webhook Server:** Setup of Node.js Express server with TypeScript and `tsx`. Configure `POST /v1/traces` endpoint listening on port `4318` with a 50MB payload limit.
* **Database Infrastructure:** Initialize SQLite database. Create tables for `raw_telemetry` (id, conversation_id, payload, created_at) and `model_costs` (model_name, input_cost_per_m, output_cost_per_m, cache_cost_per_m, reasoning_cost_per_m).
* **Ingestion Hook Testing:** Confirm telemetry raw payloads are successfully captured and saved in SQLite.

### Phase 2: Processing Engine & Cost Management API (Weeks 2-3)
* **Parser Logic:** Build flat processing parser to scan raw telemetry payload. Target leaf nodes matching spans starting with `"chat"`.
* **Relational Schema Ingestion:** Populate `conversations` and `atomic_spans` tables based on parsed spans.
* **Auto-Discovery:** Program hot insertion of new models into `model_costs` table at `$0.00` rates.
* **CRUD REST API:** Develop backend routes for `/api/model-costs` (GET, POST, PUT, DELETE) and endpoints to query aggregated conversation/span data.

### Phase 3: Vue.js Frontend Dashboard (Weeks 3-4)
* **Frontend Setup & Layout:** Initialize Vue.js project. Create a responsive Master-Detail layout.
* **History Sidebar & Filtering:** Build the left sidebar displaying conversation history, complete with filtering pills for active models.
* **KPIs & Analytical Charts:** Build interactive cards for input, output, cache, and reasoning metrics. Integrate Chart.js to render cost donut charts and token consumption timelines.
* **Cost CRUD Form & Alerts:** Create the cost management form and add visual warning badges for models with unconfigured costs.

### Phase 4: Export, Maintenance & Final Polish (Week 5)
* **Export Tooling:** Build templates for Markdown export copyable to clipboard. Implement `@media print` CSS styling for neat browser-to-PDF export.
* **Data Maintenance Tools:** Implement the frontend purge action with the backend `DELETE` and SQLite `VACUUM` routines.
* **Disk Space Monitor:** Implement the `fs.stat` backend endpoint and render the database file size in the configuration UI.
* **End-to-End Testing:** Validate telemetry ingestion under VS Code Copilot Chat workloads and execute final quality checks.
