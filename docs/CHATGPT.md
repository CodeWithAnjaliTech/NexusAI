NexusAI is a multi-agent AI workspace built with React, FastAPI, LangGraph, ChromaDB, PostgreSQL, Redis, Docker Sandbox, and Ollama/OpenAI. The LangGraph supervisor routes user requests to specialized agents such as Code, Research, Documentation, and Blueprint agents. Uploaded documents are indexed into ChromaDB for RAG-based retrieval, while Docker containers provide secure code execution. Redis handles caching and rate limiting, PostgreSQL stores application data, and SSE enables real-time streaming responses similar to ChatGPT.

Perfect. Your NexusAI document is written from a senior developer/architect perspective. If you're preparing for interviews or actually building it, it's much easier to think of it like this.

What is NexusAI?

Imagine ChatGPT, Cursor, Perplexity, and Replit are combined into one application.

A user can:

Chat with AI
Upload PDFs and ask questions
Run code
Create custom AI agents
Store memories
Search past knowledge

That's basically NexusAI.

High-Level Architecture
User
  ↓
React Frontend
  ↓
FastAPI Backend
  ↓
LangGraph Supervisor
  ↓
Different AI Agents
  ↓
LLM (GPT/Claude/Ollama)

Think:

User asks question
       ↓
Supervisor decides
       ↓
Which agent should handle it?

This is why LangGraph is used.

What is LangGraph Doing?

Imagine you're a manager.

A user asks:

"Debug my React code"

LangGraph says:

This looks like coding
      ↓
Send to Code Agent

User asks:

"Create project requirements for an e-commerce app"

LangGraph says:

This is project planning
      ↓
Send to Blueprint Agent

User asks:

"Summarize this PDF"

LangGraph says:

Need document search
      ↓
Send to Documentation Agent

LangGraph = Traffic Police.

What is an Agent?

An agent is just a specialist.

General Agent
Like ChatGPT

Handles normal conversations.

Research Agent
Like Perplexity

Researches topics.

Documentation Agent
Reads uploaded files

Example:

Upload React Guide.pdf
       ↓
Ask question
       ↓
Get answer from PDF
Blueprint Agent
Software Architect

Example:

Build me Uber

It generates:

Features
Database Design
API Structure
Timeline
Code Sandbox Agent
Like Cursor + Replit

Can execute code.

What is RAG?

This is the most important AI concept.

RAG = Retrieval Augmented Generation

Without RAG:

AI knows only training data

With RAG:

AI can read YOUR files

Example:

You upload:

Company_Policy.pdf

Ask:

How many vacation days do employees get?

Flow:

Question
   ↓
Search PDF
   ↓
Find paragraph
   ↓
Send paragraph to LLM
   ↓
Answer

That's RAG.

Why ChromaDB?

Imagine you upload:

500-page PDF

AI cannot read entire PDF every time.

So:

PDF
 ↓
Split into chunks
 ↓
Store in ChromaDB

Example:

Chunk 1
Chunk 2
Chunk 3
Chunk 4

Now searching becomes fast.

Think:

Google Search
but for PDFs
Why PostgreSQL?

Stores application data.

Example:

Users
Sessions
Chats
Documents
Memory
Custom Agents

Like any MERN app database.

Why Redis?

Redis = Super Fast Temporary Storage

Used for:

Rate Limiting
30 uploads/hour

Redis counts uploads.

Session Cache

Instead of reading DB every time:

Store temporary data in Redis

Faster.

What is SSE?

SSE = Server Sent Events

This is how streaming works.

Without SSE:

User asks question
      ↓
Wait 10 seconds
      ↓
Get entire response

With SSE:

User asks question
      ↓
H
He
Hel
Hello

Words appear live.

Exactly like ChatGPT.

What is Docker Sandbox?

Most important feature.

Suppose user writes:

console.log("Hello")

Can we run it directly on server?

❌ Dangerous

User could run:

rm -rf /

Server destroyed.

So NexusAI does:

Create Docker Container
      ↓
Run Code Inside
      ↓
Destroy Container

Safe.

Think:

Temporary Virtual Machine
Why 21 Languages?

User can run:

JavaScript
Python
Java
Go
Rust
PHP
C++

Each language has its own Docker image.

Example:

Node Image
Python Image
Java Image
What is Memory?

Like ChatGPT Memory.

Example:

Today:

My name is Anjali

Tomorrow:

What's my name?

AI remembers.

Flow:

Conversation
      ↓
Save Important Data
      ↓
Database
      ↓
Reuse Later
What are Custom Agents?

User creates their own AI.

Example:

React Expert Agent

Prompt:

You are a Senior React Architect.
Always answer with best practices.

Save it.

Now every message uses that behavior.

What is Project Scoping?

Suppose you have 3 projects:

Project A
Project B
Project C

Each project has:

Own PDFs
Own Chats
Own Memories

Without project scoping:

Documents mix together

Bad.

With project scoping:

Project A sees only Project A files
Why Ollama?

Instead of paying OpenAI.

Run AI locally:

Ollama
  ↓
Llama
Qwen
DeepSeek

No API cost.

Complete User Flow

Suppose you upload:

React Interview Guide.pdf

Then ask:

Explain useMemo

Actual flow:

User
 ↓
Frontend
 ↓
Backend
 ↓
LangGraph
 ↓
Documentation Agent
 ↓
ChromaDB Search
 ↓
Find Relevant Chunk
 ↓
Send Chunk to LLM
 ↓
LLM Generates Answer
 ↓
SSE Streaming
 ↓
Frontend Shows Answer

This single flow is basically:

React
FastAPI
LangGraph
ChromaDB
Ollama/GPT
SSE

working together.