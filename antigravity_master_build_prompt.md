# Antigravity IDE --- Master Build Prompt

You are my senior full-stack AI engineer, software architect, and coding
partner.

You are working directly inside my **Antigravity IDE workspace**. You
have permission to inspect, create, modify, and organize project files.

I am attaching a document called:

**COMPLETE_ARCHITECTURE_READY.md / DIRECTORY_STRUCTURE_GUIDE.md**

Treat the attached architecture and directory structure as the **primary
source of truth** for this project.

Your job is to help me build the actual working application inside my
project workspace.

Do not only explain the code. Create the actual folders and files, write
the implementation, connect the modules, run the application, test it,
find errors, and fix them.

------------------------------------------------------------------------

# CRITICAL WORKSPACE RULES

-   Work directly in the current workspace.
-   First inspect the existing files and folders.
-   Do not create a second project inside the project.
-   Do not overwrite working code without inspecting it first.
-   Before creating a new file, check whether an equivalent file already
    exists.
-   After each major implementation phase, run the relevant commands and
    verify the result.
-   If a command fails, diagnose and fix the actual problem.
-   Keep the project runnable after every phase.
-   Do not claim a feature is complete unless it is actually connected
    and tested.
-   Do not create fake/mock implementations for features that are
    supposed to be functional.
-   If a dependency is needed, install it properly and update
    package.json.
-   Maintain a clear implementation checklist.
-   Mark features complete only after verification.
-   Do not generate a large collection of disconnected files.
-   Do not blindly rewrite the entire project.
-   Preserve existing working code unless there is a clear architectural
    reason to change it.

------------------------------------------------------------------------

# PROJECT GOAL

Build a fully functional web application that:

1.  Accepts a website URL from the user.
2.  Uses an intelligent/agentic scraping workflow.
3.  Determines the appropriate scraping strategy.
4.  Uses static scraping when possible.
5.  Uses browser rendering for JavaScript-heavy websites when necessary.
6.  Discovers relevant internal pages.
7.  Extracts only meaningful website content.
8.  Removes unnecessary content such as navigation, advertisements,
    tracking scripts, cookie banners, footers, and irrelevant
    boilerplate.
9.  Chunks the cleaned content.
10. Generates embeddings.
11. Stores the knowledge in ChromaDB.
12. Stores metadata, websites, pages, conversations, messages, and
    scrape history in SQLite.
13. Uses Ollama for embeddings and LLM generation.
14. Answers questions strictly using the scraped website context.
15. Does not hallucinate information outside the retrieved website
    context.
16. Maintains short-term conversational memory.
17. Maintains long-term application knowledge/history.
18. Detects duplicate websites and pages.
19. Avoids unnecessary re-processing.
20. Provides a polished, professional frontend.
21. Is fully connected end-to-end.
22. Can be run locally and prepared for deployment.

------------------------------------------------------------------------

# IMPORTANT ARCHITECTURAL RULE

Follow **Single Responsibility Principle (SRP)** strictly.

Do not create giant files that contain everything.

Use:

``` text
Route
   ↓
Controller
   ↓
Service
   ↓
Specialized Services
```

Example:

``` text
POST /api/scrape
        ↓
scrape.controller.js
        ↓
scraper.service.js
        ↓
crawler.service.js
agent.service.js
cheerio.service.js
puppeteer.service.js
content cleaner
chunker
embedding service
ChromaDB service
database service
```

Every file should have one clear responsibility.

------------------------------------------------------------------------

# USE THE ATTACHED ARCHITECTURE

Follow the attached architecture for:

-   project structure
-   backend structure
-   frontend structure
-   routes
-   controllers
-   services
-   database
-   memory
-   RAG
-   ChromaDB
-   Ollama
-   API contracts
-   environment variables
-   error handling
-   testing
-   implementation phases

Do not randomly redesign the architecture unless you identify a genuine
technical problem.

If you believe a change is necessary, explain:

1.  What the current design is.
2.  What problem it causes.
3.  What you propose changing.
4.  Why the new design is better.

Then implement the change consistently across the entire project.

------------------------------------------------------------------------

# AGENTIC SCRAPING FEATURE

Do not implement the scraper as:

``` text
URL
 ↓
Always Cheerio
```

Instead:

``` text
URL
 ↓
Scraping Agent
 ↓
Analyze Website
 ↓
Choose Appropriate Tool
```

The agent should have access to controlled tools such as:

``` text
fetch_static_page()
render_dynamic_page()
discover_internal_links()
read_sitemap()
extract_content()
check_duplicate()
check_robots_txt()
```

The agent may decide:

``` text
Static HTML page
        ↓
Use Cheerio
```

or:

``` text
JavaScript-heavy page
        ↓
Use Puppeteer
```

or:

``` text
Sitemap available
        ↓
Use sitemap for page discovery
```

The LLM must NOT be allowed to execute arbitrary code.

The agent must only choose from predefined tools.

Architecture:

``` text
Scrape Request
      ↓
Scraping Agent
      ↓
Tool Selection
      │
      ├── Static Fetch Tool
      ├── Cheerio Tool
      ├── Puppeteer Tool
      ├── Sitemap Tool
      ├── Link Discovery Tool
      ├── Duplicate Detection Tool
      └── Content Extraction Tool
      ↓
Content Processing Pipeline
      ↓
Chunking
      ↓
Embeddings
      ↓
ChromaDB
```

The agent must be modular so additional tools can be added later without
rewriting the entire scraper.

------------------------------------------------------------------------

# RAG REQUIREMENTS

The chatbot must follow:

``` text
User Question
      ↓
Load Conversation History
      ↓
Understand Current Question
      ↓
Generate Query Embedding
      ↓
Retrieve Relevant Website Chunks
      ↓
Filter Low-Relevance Results
      ↓
Build Grounded Prompt
      ↓
Send Context + Question to Ollama
      ↓
Generate Answer
      ↓
Save Conversation
      ↓
Return Answer + Sources
```

The LLM system prompt must enforce:

``` text
You are a website knowledge assistant.

Answer only using the provided website context.

If the answer cannot be found in the provided context:
say clearly that the information was not found in the scraped website content.

Do not invent facts.

Do not use outside knowledge to answer factual questions about the website.
```

Every answer should ideally return:

``` json
{
  "answer": "...",
  "sources": [
    {
      "pageUrl": "...",
      "pageTitle": "...",
      "snippet": "...",
      "similarity": 0.89
    }
  ]
}
```

------------------------------------------------------------------------

# MEMORY REQUIREMENTS

## SHORT-TERM MEMORY

Used for the current conversation.

It should:

-   save chat messages
-   load recent messages
-   limit history size
-   prevent excessive context
-   support follow-up questions

Example:

``` text
User:
What services do they offer?

Assistant:
They offer web development.

User:
What about pricing?
```

The system should understand that "they" refers to the previously
discussed website/company.

## LONG-TERM MEMORY

Used for application persistence and knowledge.

Store:

-   websites
-   URLs
-   normalized URLs
-   URL hashes
-   pages
-   content hashes
-   chunks
-   scrape jobs
-   conversations
-   messages
-   timestamps
-   processing status

------------------------------------------------------------------------

# DUPLICATE DETECTION

## Website Level

``` text
New URL
   ↓
Normalize URL
   ↓
Generate URL Hash
   ↓
Check SQLite
```

If already present:

``` text
Website already exists
        ↓
Do not unnecessarily scrape again
```

## Page Level

``` text
Page Content
      ↓
Content Hash
      ↓
Compare with Existing Hash
```

If unchanged:

``` text
Skip processing
Skip embedding
Skip vector update
```

If changed:

``` text
Re-clean
Re-chunk
Re-embed
Update ChromaDB
```

------------------------------------------------------------------------

# FRONTEND REQUIREMENTS

Build the frontend in React with a polished, professional design.

## Theme

A dark blue developer/AI workspace.

Think:

``` text
VS Code interface
+
Claude-style typography
+
Modern AI chat application
```

The interface should feel:

-   professional
-   technical
-   calm
-   premium
-   modern
-   minimal
-   developer-focused

Avoid generic Bootstrap-looking interfaces, excessive gradients, and
random bright colors.

Use a cohesive design system with CSS variables:

``` css
--bg-primary
--bg-secondary
--bg-tertiary
--surface
--surface-hover
--border
--text-primary
--text-secondary
--text-muted
--accent
--accent-hover
--success
--warning
--error
```

------------------------------------------------------------------------

# FRONTEND LAYOUT

``` text
┌──────────────────────────────────────────────────────┐
│                    TOP BAR                           │
│  Logo     Website Knowledge Assistant     Status     │
├──────────────────┬───────────────────────────────────┤
│                  │                                   │
│   SIDEBAR        │           MAIN CONTENT            │
│                  │                                   │
│  Knowledge Bases │           Chat Interface          │
│                  │                                   │
│  Websites        │                                   │
│  Conversations   │                                   │
│                  │                                   │
│  + Add Website   │                                   │
│                  │                                   │
├──────────────────┴───────────────────────────────────┤
│                    INPUT AREA                         │
└──────────────────────────────────────────────────────┘
```

The sidebar should support:

-   scraped websites
-   website status
-   page counts
-   last scraped time
-   conversations
-   selecting a knowledge base
-   creating a new scrape

------------------------------------------------------------------------

# CHAT UI

The chat interface should be inspired by modern AI chat applications.

Use the provided reference image for the general interaction pattern,
but do not copy it exactly.

Use it as inspiration for:

-   message layout
-   spacing
-   input area
-   conversation flow
-   visual hierarchy

The chat should have:

-   clean message bubbles or message blocks
-   excellent typography
-   comfortable reading width
-   Markdown rendering
-   code block support
-   loading state
-   typing/generation state
-   error state
-   source citations
-   source expansion
-   empty state
-   welcome state

The chat should feel like a real, polished AI product rather than a
basic form.

------------------------------------------------------------------------

# LOGO / BRANDING

Use the provided logo reference as inspiration.

Do not blindly copy another company's branding.

Create a visually coherent mark that works:

-   in the top navigation
-   in the sidebar
-   in the empty chat state
-   as an application icon

The logo should fit the dark blue developer/AI theme.

------------------------------------------------------------------------

# FRONTEND COMPONENT ARCHITECTURE

Follow SRP here too.

Do not create one huge App.jsx.

Use components such as:

``` text
components/
├── layout/
│   ├── AppShell.jsx
│   ├── TopBar.jsx
│   └── Sidebar.jsx
│
├── websites/
│   ├── WebsiteList.jsx
│   ├── WebsiteCard.jsx
│   ├── AddWebsiteForm.jsx
│   └── ScrapeProgress.jsx
│
├── chat/
│   ├── ChatInterface.jsx
│   ├── MessageList.jsx
│   ├── MessageBubble.jsx
│   ├── ChatInput.jsx
│   ├── TypingIndicator.jsx
│   └── SourceAttribution.jsx
│
├── common/
│   ├── Button.jsx
│   ├── Modal.jsx
│   ├── Spinner.jsx
│   ├── EmptyState.jsx
│   └── ErrorState.jsx
```

Keep components small and focused.

------------------------------------------------------------------------

# API CLIENT ARCHITECTURE

The React frontend must not contain raw API calls everywhere.

Use:

``` text
components
      ↓
custom hooks
      ↓
API service layer
      ↓
backend API
```

Example:

``` text
ChatInterface
      ↓
useChat()
      ↓
chatApi.js
      ↓
POST /api/chat
```

Use separate API services:

``` text
services/
├── api.js
├── scrapeApi.js
├── chatApi.js
├── websiteApi.js
└── conversationApi.js
```

------------------------------------------------------------------------

# ERROR HANDLING

Handle:

-   invalid URL
-   website unavailable
-   scraping timeout
-   robots.txt restrictions
-   empty content
-   Puppeteer failure
-   Cheerio failure
-   Ollama unavailable
-   ChromaDB unavailable
-   database failure
-   invalid chat request
-   no relevant context found

The frontend should show useful user-friendly errors.

Do not expose raw stack traces to the user.

------------------------------------------------------------------------

# DEVELOPMENT PROCESS

Do not blindly generate 100 files in one uncontrolled step.

Work in phases.

## PHASE 0 --- INSPECT THE WORKSPACE

Before writing code:

1.  Inspect the entire current workspace.
2.  Identify the current project structure.
3.  Identify the existing frontend.
4.  Identify the existing backend.
5.  Identify existing package.json files.
6.  Identify existing environment files.
7.  Identify existing database code.
8.  Identify existing scraper/RAG/LLM code.
9.  Identify existing tests.
10. Compare the current workspace with the attached architecture
    document.

Then produce a concise gap analysis:

``` text
Already exists:
- ...

Missing:
- ...

Needs modification:
- ...

Potential conflicts:
- ...

Recommended implementation order:
1. ...
2. ...
3. ...
```

**Do not write implementation code during this inspection phase unless
absolutely necessary.**

------------------------------------------------------------------------

## PHASE 1 --- PROJECT SETUP

Create or complete:

-   root project
-   backend
-   frontend
-   package files
-   environment files
-   gitignore
-   database setup
-   basic Express server
-   basic React application

Then verify that both applications run.

------------------------------------------------------------------------

## PHASE 2 --- DATABASE

Implement:

-   database connection
-   schema
-   migrations
-   models/repositories
-   indexes
-   seed/test utilities

Verify the database.

------------------------------------------------------------------------

## PHASE 3 --- SCRAPER

Implement:

-   URL normalization
-   robots.txt checking
-   rate limiting
-   duplicate detection
-   static fetch
-   Cheerio extraction
-   Puppeteer rendering
-   internal link discovery
-   sitemap support
-   content cleaning
-   metadata extraction

Then test scraping independently.

------------------------------------------------------------------------

## PHASE 4 --- AGENTIC SCRAPING

Implement:

``` text
Scraping Agent
      ↓
Website Analysis
      ↓
Tool Selection
      ↓
Tool Execution
      ↓
Result Evaluation
      ↓
Continue / Stop / Switch Tool
```

Use controlled tools only.

The agent's job is to make scraping decisions, not to become an
unnecessary chatbot.

------------------------------------------------------------------------

## PHASE 5 --- EMBEDDINGS + CHROMADB

Implement:

-   embedding service
-   ChromaDB connection
-   collection creation
-   chunk storage
-   metadata storage
-   similarity search
-   retrieval filtering

Test retrieval before building the chatbot.

------------------------------------------------------------------------

## PHASE 6 --- RAG

Implement:

-   question processing
-   conversation memory
-   context retrieval
-   grounded prompt generation
-   Ollama generation
-   answer validation
-   source attribution
-   conversation persistence

Test the RAG pipeline independently.

------------------------------------------------------------------------

## PHASE 7 --- API

Connect:

``` text
React
  ↓
API
  ↓
Controllers
  ↓
Services
  ↓
Database / ChromaDB / Ollama
```

Test every endpoint.

------------------------------------------------------------------------

## PHASE 8 --- FRONTEND

Build the complete UI.

Do not stop at placeholder components.

The frontend should be:

-   functional
-   responsive
-   polished
-   visually consistent
-   connected to the real backend

------------------------------------------------------------------------

## PHASE 9 --- END-TO-END TESTING

Test:

``` text
Open Application
      ↓
Enter Website URL
      ↓
Start Scraping
      ↓
Agent Chooses Scraping Strategy
      ↓
Pages Discovered
      ↓
Content Extracted
      ↓
Content Cleaned
      ↓
Chunks Created
      ↓
Embeddings Generated
      ↓
Stored in ChromaDB
      ↓
User Opens Chat
      ↓
Asks Question
      ↓
Relevant Context Retrieved
      ↓
Ollama Generates Answer
      ↓
Sources Displayed
      ↓
Conversation Saved
```

------------------------------------------------------------------------

# CRITICAL IMPLEMENTATION RULES

1.  Create real working files.
2.  Do not give me only pseudocode.
3.  Do not leave important functions as TODOs.
4.  Do not use fake API responses in the final implementation.
5.  Do not create unnecessary abstractions.
6.  Do not put all logic in one file.
7.  Follow SRP.
8.  Use clear naming.
9.  Use consistent error handling.
10. Keep modules independently testable.
11. Use environment variables for configuration.
12. Never hardcode secrets.
13. Do not expose API keys or private credentials.
14. Do not allow arbitrary code execution by the scraping agent.
15. Add comments only where they explain important decisions.
16. Prefer simple, maintainable code over unnecessary complexity.
17. Make sure imports and exports are correct.
18. Make sure every file is actually connected to the application.
19. Test each phase before moving to the next.
20. Fix errors instead of working around them with fake code.

------------------------------------------------------------------------

# HOW YOU SHOULD WORK WITH ME

I am learning this architecture while building it.

Therefore:

-   Build the project with me.
-   Explain important architectural decisions.
-   When creating a major module, briefly explain its responsibility.
-   Do not overwhelm me with unnecessary theory.
-   Prefer working code.
-   If something fails, debug it with me.
-   Keep the architecture scalable but appropriate for the current
    project.

The final result should be a real, functional, modular, full-stack AI
application --- not a collection of disconnected demo files.

------------------------------------------------------------------------

# FIRST ACTION

Start by inspecting the attached architecture document and the current
project workspace.

Then:

1.  Analyze the current state of the workspace.
2.  Compare it with the attached architecture.
3.  Identify what already exists.
4.  Identify what is missing.
5.  Create a phased implementation plan.
6.  Do not write the full application yet.
7.  Wait for me to approve the implementation plan before beginning
    Phase 1.
