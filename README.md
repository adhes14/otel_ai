# VS Code Copilot Chat OTel Auditing & Reporting System

A 100% local, privacy-focused tool designed to intercept, persist, and analyze telemetry metrics emitted by **VS Code Copilot Chat**. It operates as an autonomous OTLP/HTTP collector, parsing token usage and estimated costs broken down by model (for both standard and multi-agent orchestration flows).

---

## 🛠️ Technology Stack

*   **Monorepo Manager:** `pnpm`
*   **Backend:** Node.js, TypeScript, Express, and running via `tsx` (no build step in dev).
*   **Database:** SQLite (`better-sqlite3` driver running in WAL mode).
*   **Logging:** `pino` + `pino-http` (structured JSON logging, prettified in dev).
*   **Frontend:** Vue.js 3 + TypeScript + Vite.

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

Clone this repository and run the installation script. This will download dependencies and compile native SQLite bindings for your local environment:

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

You can run individual workspaces from the root folder using `pnpm` filters:

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
*   **`GET /api/conversations`**: Returns a list of conversations sorted from newest to oldest, with cursor-based pagination and a list of distinct models used.
*   **`GET /api/conversations/:id`**: Returns conversation metadata along with token counts and calculated financial costs aggregated per model.
*   **`GET /api/conversations/:id/spans`**: Lists all flat atomic spans representing LLM interactions (where span name is `'chat'` or starts with `'chat '`) belonging to the conversation.
