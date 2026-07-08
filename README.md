# OTel Auditing & Reporting System

A 100% local, privacy-focused tool designed to intercept, persist, and analyze telemetry metrics emitted by **VS Code Copilot Chat**, **Copilot CLI**, and **Opencode**. It operates as an autonomous OTLP/HTTP collector, parsing token usage and estimated costs broken down by model (for both standard and multi-agent orchestration flows).

---

## 🛠️ Technology Stack

*   **Monorepo Manager:** `pnpm`
*   **Backend:** Node.js, TypeScript, Express, and running via `tsx` (no build step in dev).
*   **Database:** SQLite (`better-sqlite3` driver running in WAL mode).
*   **Logging:** `pino` + `pino-http` (structured JSON logging, prettified in dev).
*   **Frontend:** Vue.js 3, Vite, Vue Router 4 (routing), Pinia (state management), Chart.js & vue-chartjs (visualizations), and a custom dark-first design system.

---

## 📂 Project Structure

```text
otel_ai/
├── data/                    # Local database directory (gitignored)
│   └── otel_ai.db           # SQLite database file
├── packages/
│   ├── backend/             # Express webhook server & SQLite integrations
│   │   ├── src/
│   │   │   ├── db/          # Database connections & migrations
│   │   │   ├── routes/      # Webhook and API endpoints
│   │   │   ├── utils/       # Shared helpers (logger, etc.)
│   │   │   └── tests/       # Vitest unit tests
│   │   └── package.json
│   └── frontend/            # Vue 3 application (UI dashboard)
│       └── package.json
├── package.json             # Workspace-level package script runner
├── pnpm-workspace.yaml      # Workspace packages definitions
└── README.md
```

---

## 🚀 Getting Started

### 📋 Prerequisites

*   **Node.js** >= 18
*   **pnpm** >= 11 (used for workspace and supply chain security features)

### 1. Installation

Clone this repository and install dependencies. This will download dependencies and compile native SQLite bindings for your local environment:

```bash
# Install dependencies for all workspace projects
pnpm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

The default values are configured to run locally:
*   `PORT=4318` (The default port OpenTelemetry uses for HTTP traces)
*   `DB_PATH=../../data/otel_ai.db` (Database path relative to backend source files)
*   `LOG_LEVEL=info`

---

## 💻 Running the Application

### Running in Development Mode

You can run the entire application in development mode with a single command from the root folder:

```bash
# Install dependencies and start both backend and frontend servers in parallel
pnpm dev
```

Alternatively, you can run individual workspace projects using filters:

#### Backend Server
To start the OTLP collection server with hot-reload:
```bash
pnpm dev:backend
```
The server will start at `http://localhost:4318`.

#### Frontend UI
To start the Vue 3 dashboard development server:
```bash
pnpm dev:frontend
```
The dashboard runs at `http://localhost:5173` with a configured Vite dev server proxy to forward `/api` and `/v1` requests to port `4318`.

To build the frontend for production:
```bash
pnpm build:frontend
```

---

## 🖥️ UI Dashboard Features

The application includes a fully responsive split master-detail dashboard featuring:
*   **Chronological Session History:** Scrollable panel showing conversation title, date, ID, and active models. Real-time client-side search/filtering is supported, along with infinite scroll paging.
*   **Agent-Based Filtering & Token Aggregation:** Expandable agent hierarchy under each conversation item. Click the main session or select specific subagents or orchestration agents to filter spans and aggregate token/cost metrics on-the-fly.
*   **Editable Conversation Titles:** Supports editing the conversation title directly from the detail header inline (by clicking the title). Changes are saved on Enter or blur, and persist in the database.
*   **Model Filter Checkboxes:** Filter out specific model spans with compute/token updates on-the-fly.
*   **KPI Cards:** Shows total counts and dollar cost breakdowns for Input, Output, Cache (Read/Write), and Reasoning tokens, plus a dedicated **Cache Savings** card displaying the overall percentage savings and standard-billing cost if caching were disabled.
*   **Interactive Visualizations:**
    *   **Cost Distribution (Donut Chart):** Shows the cost distribution per model in dollars.
    *   **Token Consumption Over Time (Bar Chart):** Stacks input, output, cache read/write, and reasoning tokens for sequential spans (capped at 50 spans for clarity).
*   **Model Cost Manager:** Full sub-view (`/settings/model-costs`) supporting rate creation, deletion, and inline edits. A status warning `⚠️ Cost not configured` badge alerts users to $0.00 rate models discovered via OTel telemetry.
*   **Raw Telemetry Log Viewer:** A dedicated view (`/telemetry`) to browse intercepted raw telemetry logs (OTel traces) with an interactive JSON tree viewer, copy the raw JSON payload to the clipboard, or delete individual traces via a safety confirmation modal.
*   **Conversation Export System:** In-header actions allowing copying a structured Markdown report of the session (adhering to active model filter pills) directly to the clipboard, or printing/saving as PDF using a print media-optimized stylesheet.
*   **System Settings & Maintenance:** Dedicated configuration panel (`/settings`) showing the local database file size (auto-refreshable) and allowing purging of raw telemetry logs older than `N` days, cleaning up telemetry records with zero token consumption (both with safety confirmation modals), as well as rebuilding all derived conversation and span data from historical raw telemetry logs.

---

## 🧪 Testing

We use **Vitest** for testing the ingestion endpoint and database migrations.

To run the unit tests:
```bash
pnpm test
```

---

## 📡 API Endpoints

### 🔌 Ingestion & Utility Endpoints
*   **`POST /v1/traces`**: The primary OTel ingestion endpoint. Receives payloads with `Content-Type: application/json` or `application/x-protobuf`, records them into `raw_telemetry` table, and triggers async parsing in the background.
*   **`GET /healthz`**: Simple healthcheck returning status code `200 OK` and system uptime.

### 🤖 Model Costs (CRUD)
*   **`GET /api/model-costs`**: Lists all configured model cost rates per million tokens.
*   **`POST /api/model-costs`**: Adds a new model cost entry.
*   **`PUT /api/model-costs/:modelName`**: Updates an existing model's cost rates.
*   **`DELETE /api/model-costs/:modelName`**: Deletes a model cost entry.

### 💬 Conversations & Spans Querying
*   **`GET /api/conversations`**: Returns a list of conversations sorted from newest to oldest, with cursor-based pagination and lists of distinct models and agents used.
*   **`GET /api/conversations/:id`**: Returns conversation metadata along with token counts and calculated financial costs aggregated per model. Supports an optional `agent_name` query parameter to filter by agent.
*   **`PATCH /api/conversations/:id`**: Updates the title of a conversation (expects `{ title: string }` payload).
*   **`GET /api/conversations/:id/spans`**: Lists all flat atomic spans belonging to the conversation. Supports an optional `agent_name` query parameter to filter by agent.

### 📡 Raw Telemetry APIs
*   **`GET /api/raw-telemetry`**: Returns a cursor-paginated list of raw telemetry traces with optional search filtering.
*   **`GET /api/raw-telemetry/:id`**: Fetches the interactive JSON payload and metadata of a single raw telemetry trace.
*   **`GET /api/conversations/:id/raw-telemetry`**: Lists raw telemetry IDs and payloads associated with a specific conversation.
*   **`DELETE /api/raw-telemetry/:id`**: Deletes a single raw telemetry trace from the database.

### ⚙️ System Maintenance
*   **`GET /api/maintenance/db-stat`**: Returns the local SQLite database file size in bytes and megabytes.
*   **`DELETE /api/maintenance/raw-telemetry?older_than_days=N`**: Deletes raw telemetry log records older than `N` days, checkpoints the WAL, and vacuums the database to release unused disk space back to the filesystem.
*   **`DELETE /api/maintenance/clear-no-tokens`**: Deletes all raw telemetry records, atomic spans, and conversations that have zero token consumption (input tokens <= 0), checkpoints the WAL, and vacuums the database.
*   **`POST /api/maintenance/reprocess`**: Clears derived `conversations` and `atomic_spans` tables and re-processes all stored `raw_telemetry` records chronologically to rebuild the database.
