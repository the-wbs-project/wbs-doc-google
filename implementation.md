Implementation Plan: Serverless WBS Ingestion Engine
Target Stack: Cloudflare Workers, Workflows, Containers (Beta), MongoDB, R2, PromptHub.

1. Project Initialization & Structure
Goal: Set up a monorepo-style structure to manage the Worker, the Workflow, and the two Container services.

Directory Structure: /wbs-ingestion ├── /src │ ├── /workflow # The Cloudflare Workflow logic │ │ ├── WbsWorkflow.ts # Main Workflow Entrypoint │ │ └── treeUtils.ts # Algorithms for tree reconstruction │ ├── /worker # The API Worker (Uploads/Trigger) │ │ └── index.ts │ └── /utils │ └── prompthub.ts # PromptHub API client ├── /containers │ ├── /java-mpp # Java Service for.mpp files │ │ ├── Dockerfile │ │ └── src/ # Java source (MPXJ + Javalin/Spring) │ └── /python-pdf # Python Service for PDF Layout │ ├── Dockerfile │ └── src/ # Python source (pdfplumber + FastAPI) ├── wrangler.toml # Main config ├── package.json └── schema.sql # D1 Database Schema

2. Infrastructure Setup (The "Plumbing")
Task 2.1: Wrangler Configuration

Action: Configure wrangler.toml with necessary bindings.

Bindings Required:

[[d1_databases]]: REMOVED (Replaced by MongoDB).

[[r2_buckets]]: Binding name FILES_BUCKET.

[[workflows]]: Binding name INGESTION_WORKFLOW.

[[containers]]: Two entries.

Name: MPP_SERVICE, Image: ./containers/java-mpp

Name: PDF_SERVICE, Image: ./containers/python-pdf

[vars]: PROMPTHUB_API_KEY (via secret), PROMPTHUB_PROJECT_ID, MONGO_URI (via secret).

Task 2.2: Database Schema

Action: Create schema validation (optional in Mongo, but good practice). No `schema.sql` needed.

Schema Details:

projects: id (UUID), name, created_at.

tasks: id (UUID), project_id, name, indent_level, parent_id, order_index, metadata (JSON).

3. Component 1: The Containers (Heavy Lifters)
Task 3.1: Java MPP Service

Goal: Parse .mpp files and return a flat JSON list with hierarchy data.

Dockerfile: Base image eclipse-temurin:17-jre-alpine.

Dependencies: mpxj, javalin (for a lightweight HTTP server), jackson.

Endpoint: POST /parse. Accepts binary body or R2 Presigned URL.

Logic:

Read stream into UniversalProjectReader.

Iterate tasks.

Extract: TaskID, Name, OutlineLevel (Critical), Start, Finish.

Return JSON Array.

Task 3.2: Python PDF Service

Goal: Split PDFs and extract text layout coordinates.

Dockerfile: Base image python:3.9-slim.

Dependencies: pdfplumber, fastapi, uvicorn, python-multipart.

Endpoints:

POST /split: Accepts PDF, returns list of images (base64 or R2 keys).

POST /analyze: Accepts single page image/PDF, returns text blocks with x0 (indentation) coordinates.

4. Component 2: PromptHub Integration
Task 4.1: PromptHub Client (utils/prompthub.ts)

Goal: Fetch the "production" prompt dynamically.

Function: fetchSystemPrompt(projectId: string)

Logic:

Call GET https://app.prompthub.us/api/v1/projects/{id}/head

Cache the response in a global variable or KV for 5 minutes to reduce latency.

Return the messages array from the response.

5. Component 3: The Workflow (The "Brain")
Task 5.1: Workflow Entrypoint (src/workflow/WbsWorkflow.ts)

Class: Extend WorkflowEntrypoint.

Run Method Logic:

Step 1 (Identify): Check file extension.

Step 2 (Route):

If MPP: Call MPP_SERVICE container.

If PDF: Call PDF_SERVICE container to split pages.

Step 3 (Map - PDF Only):

Iterate through page images.

Fetch Prompt from PromptHub.

Use Promise.all to send each page + prompt to an LLM (e.g., Workers AI or OpenAI).

Prompt logic: "Extract tasks. Use visual indentation to determine hierarchy level (0, 1, 2)."

Step 4 (Reduce/Normalize):

Combine results into a single flat array.

Call reconstructTree(flatList) (see below).

Step 5 (Persist): Insert into MongoDB `tasks` collection.

6. Component 4: Tree Reconstruction Algorithm
Task 6.1: The Stack Algorithm (src/workflow/treeUtils.ts)

Context: LLMs and MPXJ give us a flat list with an "indent level" or "outline level". We need to turn this into "Parent IDs".

Algorithm:

7. Testing & Validation
Unit Test (Algorithm): Write a test for reconstructTree with a mock flat list to ensure Parent IDs are assigned correctly.

Integration Test (MPP): Deploy Java container. Upload a sample .mpp to R2. Trigger workflow. Check D1 for structured rows.

Integration Test (PDF): Upload a 12-page PDF. Verify that the workflow splits it, processes pages in parallel, and reassembles the order correctly without timeouts.