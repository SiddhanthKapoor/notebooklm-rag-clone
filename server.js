import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';
import { ChatOpenAI } from '@langchain/openai';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Configure Multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
const upload = multer({ dest: 'uploads/' });

// Global vector store registry
const vectorStores = {};

// Initialize embeddings
const embeddings = new OpenAIEmbeddings({
    model: 'text-embedding-3-small', // cost effective
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

        // 1. Ingestion: Load the PDF
        const loader = new PDFLoader(filePath);
        const rawDocs = await loader.load();

        // 2. Chunking: Split the document into chunks
        // Documented Chunking Strategy: Recursive Character Text Splitter
        // This splits text using a list of characters (like paragraphs, sentences, words).
        // It tries to keep semantically related pieces of text together.
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
        res.status(500).json({ error: 'Failed to process document. Make sure Qdrant and OpenAI are properly configured.' });
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
        const llm = new ChatOpenAI({
            modelName: 'gpt-4o-mini', // Cost effective but very capable
            temperature: 0,
        });

        const systemPrompt = `You are a helpful AI assistant. Answer the user's question based ONLY on the following context. 
If the answer is not contained in the context, say "I cannot answer this based on the provided document." Do NOT use your outside knowledge.

Context:
{context}`;

        const prompt = ChatPromptTemplate.fromMessages([
            ['system', systemPrompt],
            ['user', '{input}'],
        ]);

        const documentChain = await createStuffDocumentsChain({
            llm,
            prompt,
        });

        const retrievalChain = await createRetrievalChain({
            combineDocsChain: documentChain,
            retriever,
        });

        const response = await retrievalChain.invoke({
            input: question,
        });

        res.json({ answer: response.answer });

    } catch (error) {
        console.error('Error generating answer:', error);
        res.status(500).json({ error: 'Failed to generate answer.' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
