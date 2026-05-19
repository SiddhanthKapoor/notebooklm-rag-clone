import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { QdrantVectorStore } from '@langchain/qdrant';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// pdf-parse expects DOMMatrix, absent in the Vercel Node runtime.
if (typeof global.DOMMatrix === 'undefined') {
    global.DOMMatrix = class DOMMatrix {};
}

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.get('/', (req, res) => res.sendFile(path.join(process.cwd(), 'index.html')));
app.get('/style.css', (req, res) => res.sendFile(path.join(process.cwd(), 'style.css')));
app.get('/app.js', (req, res) => res.sendFile(path.join(process.cwd(), 'app.js')));
app.get('/favicon.png', (req, res) => res.sendFile(path.join(process.cwd(), 'favicon.png')));

const upload = multer({ dest: os.tmpdir() });
const vectorStores = {};

const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-embedding-2',
});

const createLLM = () => new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-flash-latest',
    temperature: 0,
});

const collectionFor = (sessionId) => `session_${sessionId.replace(/-/g, '')}`;

// ── Corrective RAG ───────────────────────────────────────────────────────────

// Grade each retrieved chunk and keep only those relevant to the question.
async function gradeDocuments(question, docs) {
    if (docs.length === 0) return [];

    const numbered = docs.map((d, i) => `[${i}]\n${d.pageContent}`).join('\n\n');
    const prompt = `You grade retrieved document chunks for relevance to a user question.
A chunk is relevant only if it contains information that helps answer the question.

Question: ${question}

Chunks:
${numbered}

Respond with ONLY a JSON array of the indices of the relevant chunks, e.g. [0,2].`;

    const response = await createLLM().invoke(prompt);
    const match = String(response.content).match(/\[[\d,\s]*\]/);
    if (!match) return docs;

    const indices = JSON.parse(match[0]);
    return indices.map((i) => docs[i]).filter(Boolean);
}

// Rewrite the question into a keyword-rich query for the corrective web search.
async function rewriteQuery(question) {
    const prompt = `Rewrite the question below as a concise, keyword-rich web search query.
Return only the rewritten query.

Question: ${question}`;
    const response = await createLLM().invoke(prompt);
    return String(response.content).trim();
}

// Fall back to live web search when the document lacks relevant context.
async function webSearch(query) {
    if (!process.env.TAVILY_API_KEY) return [];

    const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: process.env.TAVILY_API_KEY,
            query,
            max_results: 4,
        }),
    });
    if (!response.ok) return [];

    const data = await response.json();
    return (data.results || []).map((r) => r.content);
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.post('/api/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const sessionId = uuidv4();
        require('pdf-parse');

        const rawDocs = await new PDFLoader(req.file.path).load();
        const docs = await new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        }).splitDocuments(rawDocs);

        vectorStores[sessionId] = await QdrantVectorStore.fromDocuments(docs, embeddings, {
            url: process.env.QDRANT_URL,
            apiKey: process.env.QDRANT_API_KEY,
            collectionName: collectionFor(sessionId),
        });

        fs.unlinkSync(req.file.path);

        res.json({ message: 'Document processed and indexed successfully!', sessionId });
    } catch (error) {
        console.error('Error processing document:', error);
        res.status(500).json({ error: `Server Error: ${error.message || error}` });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { sessionId, question } = req.body;
        if (!sessionId || !question) {
            return res.status(400).json({ error: 'Missing sessionId or question' });
        }

        let vectorStore = vectorStores[sessionId];
        if (!vectorStore) {
            try {
                vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
                    url: process.env.QDRANT_URL,
                    apiKey: process.env.QDRANT_API_KEY,
                    collectionName: collectionFor(sessionId),
                });
                vectorStores[sessionId] = vectorStore;
            } catch {
                return res.status(404).json({ error: 'Session not found. Please upload the document again.' });
            }
        }

        // Retrieve, then grade the retrieved chunks.
        const retrieved = await vectorStore.asRetriever({ k: 4 }).invoke(question);
        const relevantDocs = await gradeDocuments(question, retrieved);

        // Corrective step: when any chunk is irrelevant, rewrite the query and
        // supplement the context with web search results.
        const contextParts = relevantDocs.map((d) => d.pageContent);
        if (relevantDocs.length < retrieved.length) {
            const webResults = await webSearch(await rewriteQuery(question));
            contextParts.push(...webResults);
        }

        const context = contextParts.join('\n\n') || 'No relevant context found.';

        const prompt = ChatPromptTemplate.fromMessages([
            ['system', `You are a helpful AI assistant. Answer the user's question using ONLY the context below.
If the context does not contain the answer, say "I cannot answer this based on the available information."

Context:
{context}`],
            ['user', '{question}'],
        ]);

        const answer = await prompt
            .pipe(createLLM())
            .pipe(new StringOutputParser())
            .invoke({ context, question });

        res.json({ answer });
    } catch (error) {
        console.error('Error generating answer:', error);
        res.status(500).json({ error: 'Failed to generate answer.' });
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => console.log(`Server is running on port ${port}`));
}

export default app;
