# GenAI Assignment 03 — Google NotebookLM RAG Clone

A full RAG (Retrieval-Augmented Generation) pipeline application where users can upload any PDF document and chat with it. 
Built by **Siddhanth Kapoor** (Roll No: 10154).

## 🚀 Live Demo
**Live Project Link:** [https://notebooklm-rag-clone.vercel.app/](https://notebooklm-rag-clone.vercel.app/)

## Features Implemented
- **Corrective RAG (CRAG) Pipeline**: Retrieved chunks are graded for relevance before generation.
- **Self-correcting Retrieval**: When chunks are irrelevant, the query is rewritten and supplemented with a live web search.
- **Web UI**: Simple chat interface built with HTML/CSS/JS.
- **Document Processing**: Ingests completely unseen PDF files.
- **Vector Database**: Uses Qdrant Cloud for storing vector embeddings.

## Corrective RAG Flow
1. **Retrieve** the top chunks from Qdrant for the user question.
2. **Grade** each chunk with the LLM, keeping only the ones relevant to the question.
3. **Correct** — if any chunk is irrelevant, the question is rewritten into a search query and a Tavily web search supplements the context.
4. **Generate** the answer strictly from the verified context.

## Chunking Strategy Documented
**Strategy Used**: `RecursiveCharacterTextSplitter` from LangChain.
- **Why**: This is the recommended text splitter for generic text. It is parameterized by a list of characters. It tries to split on them in order until the chunks are small enough.
- **How it works**: By default, it tries to split on `["\n\n", "\n", " ", ""]`. This has the effect of trying to keep all paragraphs (and then sentences, and then words) together as long as possible, as those would generically seem to be the strongest semantically related pieces of text.
- **Parameters**: 
  - `chunkSize`: 1000 characters.
  - `chunkOverlap`: 200 characters (ensures context isn't lost between boundaries).

## Local Setup Instructions

1. **Clone the Repository**
   ```bash
   git clone <your-repo-link>
   cd GenAIAss2
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Variables**
   Rename `.env.example` to `.env` and fill in your keys:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   QDRANT_URL=your_qdrant_url (e.g., https://your-cluster.aws.cloud.qdrant.io:6333)
   QDRANT_API_KEY=your_qdrant_api_key
   TAVILY_API_KEY=your_tavily_api_key
   ```
   `TAVILY_API_KEY` is optional — without it the corrective step falls back to the graded document chunks only.

4. **Run the Application**
   ```bash
   npm start
   ```
   Open `http://localhost:3000` in your browser.

## Live Deployment (Render / Vercel / Railway)
To deploy this project:
1. Push this code to GitHub.
2. Link your repository to a service like Render (Web Service), Vercel, or Railway.
3. Make sure to add `GEMINI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, and `TAVILY_API_KEY` in the hosting environment variables settings.
4. The application will build and deploy seamlessly!
