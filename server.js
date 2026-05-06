import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { QdrantVectorStore } from '@langchain/qdrant';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Polyfill DOMMatrix for pdf-parse on Vercel Node environments
if (typeof global.DOMMatrix === 'undefined') {
    global.DOMMatrix = class DOMMatrix {};
}

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
// Serve static files (used for local development)
app.get('/', (req, res) => res.sendFile(path.join(process.cwd(), 'index.html')));
app.get('/style.css', (req, res) => res.sendFile(path.join(process.cwd(), 'style.css')));
app.get('/app.js', (req, res) => res.sendFile(path.join(process.cwd(), 'app.js')));
app.get('/favicon.png', (req, res) => res.sendFile(path.join(process.cwd(), 'favicon.png')));

// Configure Multer for file uploads using OS temp directory (works on Vercel)
const uploadDir = os.tmpdir();
const upload = multer({ dest: uploadDir });

// Global vector store registry
const vectorStores = {};

// Initialize embeddings
const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-embedding-2', // Latest stable Gemini embedding model
});

// API Endpoint to Upload and Process PDF
app.post('/api/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const sessionId = uuidv4();
        const filePath = req.file.path;
        const collectionName = `session_${sessionId.replace(/-/g, '')}`;

        // Ensure pdf-parse is bundled by Vercel
        require('pdf-parse');

        // 1. Ingestion: Load the PDF using Langchain's robust PDFLoader
        const loader = new PDFLoader(filePath);
        const rawDocs = await loader.load();

        // 2. Chunking: Split the document into chunks
        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const docs = await textSplitter.splitDocuments(rawDocs);

        // 3 & 4. Embedding and Storage: Store chunks in Qdrant
        const vectorStore = await QdrantVectorStore.fromDocuments(docs, embeddings, {
            url: process.env.QDRANT_URL,
            apiKey: process.env.QDRANT_API_KEY,
            collectionName: collectionName,
        });

        // Save reference for this session
        vectorStores[sessionId] = vectorStore;

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        res.json({
            message: 'Document processed and indexed successfully!',
            sessionId: sessionId,
        });

    } catch (error) {
        console.error('Error processing document:', error);
        res.status(500).json({ error: `Server Error: ${error.message || error.toString()}` });
    }
});

// API Endpoint to Ask Questions
app.post('/api/chat', async (req, res) => {
    try {
        const { sessionId, question } = req.body;

        if (!sessionId || !question) {
            return res.status(400).json({ error: 'Missing sessionId or question' });
        }

        let vectorStore = vectorStores[sessionId];
        
        // If the server restarted, we could try to connect to the existing collection
        if (!vectorStore) {
             try {
                vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
                    url: process.env.QDRANT_URL,
                    apiKey: process.env.QDRANT_API_KEY,
                    collectionName: `session_${sessionId.replace(/-/g, '')}`
                });
                vectorStores[sessionId] = vectorStore;
             } catch(err) {
                 return res.status(404).json({ error: 'Session not found. Please upload the document again.' });
             }
        }

        // 5. Retrieval: Retrieve most relevant chunks
        const retriever = vectorStore.asRetriever({ k: 4 });

        // 6. Generation: Use LLM with retrieved context
        const llm = new ChatGoogleGenerativeAI({
            apiKey: process.env.GEMINI_API_KEY,
            model: 'gemini-flash-latest', // Fast and cost effective
            temperature: 0,
        });

        const systemPrompt = `You are a helpful AI assistant. Answer the user's question based ONLY on the following context. 
If the answer is not contained in the context, say "I cannot answer this based on the provided document." Do NOT use your outside knowledge.

Context:
{context}`;

        const prompt = ChatPromptTemplate.fromMessages([
            ['system', systemPrompt],
            ['user', '{question}'],
        ]);

        const chain = RunnableSequence.from([
            {
                context: async (input) => {
                    const docs = await retriever.invoke(input.question);
                    return docs.map(d => d.pageContent).join("\\n\\n");
                },
                question: (input) => input.question,
            },
            prompt,
            llm,
            new StringOutputParser()
        ]);

        const answer = await chain.invoke({
            question: question,
        });

        res.json({ answer: answer });

    } catch (error) {
        console.error('Error generating answer:', error);
        res.status(500).json({ error: 'Failed to generate answer.' });
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}

export default app;
