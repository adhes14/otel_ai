# 📄 Product Requirements Document (PRD)

## Local Token Auditing and Reporting System for VS Code Copilot Chat

## 1. Product Overview

The goal of this system is to locally intercept, persist, and analyze telemetry metrics emitted by **VS Code Copilot Chat**. The system will act as an autonomous OTLP/HTTP collector to accurately process token usage and costs (broken down by model) for both standard and complex (multi-agent) interactions.

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

### 🗄️ Two-Layer Storage Strategy (SQLite)

To shield the system against schema changes in VS Code and guarantee performance, the database will be structured as follows:

1. **Raw Telemetry Table (`raw_telemetry`):**
   * Stores the complete JSON payload exactly as received from the OTLP protocol.
   * Fields: `id` (Autoincrement), `conversation_id` (Nullable initially), `payload` (TEXT/JSON), `created_at` (Timestamp).

2. **Processed Tables (Relaxed Relational Schema):**
   * `conversations`: Stores the unique `gen_ai.conversation.id` identifier and aggregated session metadata.
   * `atomic_spans`: Stores flat records of AI execution nodes that contain token metrics.

---

## 3. Processing Logic and Calculation Engine (Core)

The analytical engine in the backend will avoid reconstructing complex hierarchical or parent-child orchestration trees (thereby preventing double-counting in nested subagent calls).

### 🧠 Flat Extraction Algorithm (Safe Strategy)

* **Root Filter:** The parser will traverse the flat structure of the spans, ignoring intermediate nodes such as `invoke_agent` or `execute_tool`. The engine will **only** target leaf nodes where the span identifier property is exactly `name == "chat"`.
* **Attribute Mapping:** From each `"chat"` node, it will extract directly:
  * `gen_ai.conversation.id` (Grouping key for the chat).
  * `gen_ai.response.model` or `gen_ai.request.model` (Model identifier).
  * Usage metrics: `input_tokens`, `output_tokens`, `cache_read_tokens` (or equivalent cache telemetry), and `reasoning_tokens`.

---

## 4. Cost Management and CRUD Module

### 📊 Relational Cost Table (`model_costs`)

The system will maintain a dedicated SQLite table to map financial processing rates:

* **Primary Key / ID:** `model_name` (Must match exactly the identifier string injected by OTel, e.g., `gpt-4o`).
* **Columns:** `input_cost_per_m`, `output_cost_per_m`, `cache_cost_per_m`, `reasoning_cost_per_m` (All represented numerically based on cost per 1 million tokens).

### 🤖 Automatic Model Discovery (Auto-discovery)

* If the webhook processes a span with a model that does not exist in the `model_costs` table, the backend will perform an **automatic hot insertion** with rates initialized to `$0.00`.
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

* **Controlled Manual Purge:** No destructive background tasks will run automatically. The Vue UI will provide an explicit, confirmation-guarded **"Purge raw history"** button.
* **Storage Optimization:** The associated endpoint will execute a `DELETE FROM raw_telemetry WHERE created_at < :date` followed immediately by SQLite's `VACUUM` command to reclaim actual user disk space.
* **Space Monitoring:** The backend will use Node.js's native `fs.stat` API to return the actual file size of the `.db` file in megabytes/gigabytes, displaying it prominently on the configuration dashboard.

---

## 7. Phased Implementation Plan

To ensure a structured and iterative development process, the system implementation is broken down into four distinct phases:

### Phase 1: Ingestion Endpoint & Local Database Setup (Weeks 1-2)
* **Express Webhook Server:** Setup of Node.js Express server with TypeScript and `tsx`. Configure `POST /v1/traces` endpoint listening on port `4318` with a 50MB payload limit.
* **Database Infrastructure:** Initialize SQLite database. Create tables for `raw_telemetry` (id, conversation_id, payload, created_at) and `model_costs` (model_name, input_cost_per_m, output_cost_per_m, cache_cost_per_m, reasoning_cost_per_m).
* **Ingestion Hook Testing:** Confirm telemetry raw payloads are successfully captured and saved in SQLite.

### Phase 2: Processing Engine & Cost Management API (Weeks 2-3)
* **Parser Logic:** Build flat processing parser to scan raw telemetry payload. Target leaf nodes matching `name == "chat"`.
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
