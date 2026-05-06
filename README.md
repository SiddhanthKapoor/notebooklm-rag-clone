# GenAI Assignment 03 — Google NotebookLM RAG Clone

A full RAG (Retrieval-Augmented Generation) pipeline application where users can upload any PDF document and chat with it. 
Built by **Siddhanth Kapoor** (Roll No: 10154).

## Features Implemented
- **Full RAG Pipeline**: End-to-end ingestion, chunking, embedding, storage, retrieval, and generation.
- **Web UI**: Beautiful and simple UI built with HTML/CSS/JS.
- **Document Processing**: Ability to ingest completely unseen PDF files.
- **Vector Database**: Uses Qdrant Cloud for storing vector embeddings.
- **LLM Context Anchoring**: Gpt-4o-mini restricted to only answer from the retrieved document context.

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
   OPENAI_API_KEY=your_openai_api_key
   QDRANT_URL=your_qdrant_url (e.g., https://your-cluster.aws.cloud.qdrant.io:6333)
   QDRANT_API_KEY=your_qdrant_api_key
   ```

4. **Run the Application**
   ```bash
   npm start
   ```
   Open `http://localhost:3000` in your browser.

## Live Deployment (Render / Vercel / Railway)
To deploy this project:
1. Push this code to GitHub.
2. Link your repository to a service like Render (Web Service), Vercel, or Railway.
3. Make sure to add `OPENAI_API_KEY`, `QDRANT_URL`, and `QDRANT_API_KEY` in the hosting environment variables settings.
4. The application will build and deploy seamlessly!
