# 🏗️ CRM CONVERSACIONAL — Arquitectura completa
## Construido sobre el sistema multi-agente LangChain + DeepSeek

```mermaid
flowchart TB
    T["🏗️ CRM CONVERSACIONAL CON LANGCHAIN + DEEPSEEK"]

    subgraph USER_LAYER["👤 INTERFAZ"]
        CLI["💻 crm-cli.mjs (interactivo/single-shot)"]
        SUP["🧠 Supervisor (orquestador)"]
    end

    subgraph CRM_AGENT["🤖 CRM AGENT (crm-agent.mjs)"]
        LLM["deepseek-chat · temp 0.3"]
        TOOLS["13 Tools CRUD"]
    end

    subgraph DATA["💾 PERSISTENCIA (JSON en disco)"]
        CONTACTS["contactos.json<br/>ContactStore"]
        DEALS["deals.json<br/>DealStore"]
        CONVOS["conversations.json<br/>ConversationStore"]
    end

    subgraph MODELS["📐 MODELOS (models.mjs)"]
        M1["Contact<br/>id, name, phone, email<br/>source, tags, notes"]
        M2["Deal<br/>id, contactId, title<br/>value, stage, source"]
        M3["Conversation<br/>id, contactId, channel<br/>messages[], status"]
        M4["Pipeline<br/>stages[], deals[]"]
    end

    subgraph RAG["🧠 RAG SEMÁNTICO (rag-crm.mjs)"]
        IDX["Indexador → Chunks 500 chars"]
        EMB["all-MiniLM-L6-v2 (384d)"]
        FAISS["FAISS IndexFlatL2"]
        QA["DeepSeek Chat + Prompt RAG"]
    end

    subgraph TOOLS_LIST["🔧 TOOLS (crm-tools.mjs)"]
        T1["crear_contacto"]
        T2["listar_contactos"]
        T3["obtener_contacto"]
        T4["crear_deal"]
        T5["listar_deals"]
        T6["actualizar_etapa_deal"]
        T7["resumen_pipeline"]
        T8["crear_conversacion"]
        T9["agregar_mensaje"]
        T10["obtener_conversacion"]
        T11["listar_conversaciones"]
        T12["asignar_conversacion"]
    end

    subgraph DEMO["📊 DATOS DEMO (seed-demo.mjs)"]
        D1["👤 María García<br/>WhatsApp · VIP<br/>Deal: $1,188 · Negotiation"]
        D2["👤 Carlos López<br/>Instagram · Nuevo<br/>Deal: $588 · Qualified"]
        D3["👤 Ana Martínez<br/>Webchat · Recurrente<br/>Deal: $1,188 · Closed Won"]
    end

    %% CONEXIONES
    CLI --> SUP
    SUP -- "delegar_crm_agent" --> CRM_AGENT
    CRM_AGENT --> LLM
    LLM --> TOOLS
    
    TOOLS --> T1
    TOOLS --> T2
    TOOLS --> T3
    TOOLS --> T4
    TOOLS --> T5
    TOOLS --> T6
    TOOLS --> T7
    TOOLS --> T8
    TOOLS --> T9
    TOOLS --> T10
    TOOLS --> T11
    TOOLS --> T12

    T1 --> CONTACTS
    T2 --> CONTACTS
    T3 --> CONTACTS
    T4 --> DEALS
    T5 --> DEALS
    T6 --> DEALS
    T7 --> DEALS
    T8 --> CONVOS
    T9 --> CONVOS
    T10 --> CONVOS
    T11 --> CONVOS
    T12 --> CONVOS

    CONTACTS --> MODELS
    DEALS --> MODELS
    CONVOS --> MODELS

    CONVOS --> IDX
    IDX --> EMB
    EMB --> FAISS
    FAISS --> QA
    CONTACTS -.-> |metadatos| FAISS

    DEMO --> CONTACTS
    DEMO --> DEALS
    DEMO --> CONVOS
```

## 📂 Estructura de archivos

```
agentes/crm/
├── models.mjs            # Entidades: Contact, Deal, Conversation, Pipeline
├── crm-agent.mjs         # Agente LangGraph (mismo patrón que file-agent)
├── crm-cli.mjs           # CLI interactivo + single-shot
├── crm-server.mjs        # Servidor Express + Webhooks + Canales reales
├── seed-demo.mjs         # Siembra datos demo
├── rag-crm.mjs           # RAG sobre conversaciones (búsqueda semántica)
├── channels/
│   ├── whatsapp-channel.mjs  # WhatsApp real via Baileys (QR + mensajes)
│   ├── instagram-channel.mjs # Instagram via Graph API webhook
│   └── crm-bridge.mjs        # Puente: canal → CRM Agent → respuesta
├── tools/
│   └── crm-tools.mjs     # 13 DynamicStructuredTools CRUD
├── stores/
│   ├── base-store.mjs     # Store base con persistencia JSON
│   ├── contact-store.mjs  # CRUD + búsqueda de contactos
│   ├── deal-store.mjs     # CRUD + pipeline summary de deals
│   └── conversation-store.mjs # CRUD + transcript de conversaciones
└── data/
    ├── contacts.json      # Persistencia automática
    ├── deals.json
    ├── conversations.json
    ├── whatsapp-auth/     # Auth multi-device de Baileys
    └── faiss-conversations/  # Índice vectorial FAISS
```

## 🔄 Flujo completo

### CLI / Supervisor
```
1️⃣ USUARIO: "crea un contacto llamado Pedro"
   → crm-cli.mjs / index.mjs
   → crm-agent.mjs (LangGraph + DeepSeek)
   → createContactTool (DynamicStructuredTool)
   → ContactStore.put()
   → contactos.json (disco)
```

### Canales Reales (WhatsApp / Instagram)
```
2️⃣ CLIENTE: "Hola, quiero info del plan" (desde WhatsApp)
   → whatsapp-channel.mjs (Baileys WebSocket)
   → crm-bridge.mjs
      → Identifica/crea contacto por teléfono
      → Busca conversación activa o crea nueva
      → Guarda mensaje en ConversationStore
      → Invoca CRM Agent con contexto (historial + deals)
   → crm-agent.mjs (DeepSeek + Tools)
   → ¡Respuesta automática al cliente por WhatsApp!
   → Mensaje guardado en historial del CRM
```

### RAG / Consultas
```
3️⃣ USUARIO: "qué dijo María sobre precios?"
   → crm-cli.mjs
   → crm-agent.mjs
   → RAG: FAISS similaritySearch → DeepSeek responde con contexto
   → "María preguntó por el plan Professional..."
```

### Pipeline / Negocio
```
4️⃣ USUARIO: "mueve el deal de Carlos a negotiation"
   → index.mjs → Supervisor → delegar_crm_agent
   → crm-agent → updateDealStageTool
   → deals.json actualizado
```

## ⚡ Comandos

```bash
# Sembrar datos demo
node agentes/crm/seed-demo.mjs --force

# CLI interactivo del CRM
node agentes/crm/crm-cli.mjs

# Consulta directa (sin interactivo)
node agentes/crm/crm-cli.mjs "listar contactos"

# Indexar conversaciones en FAISS
node agentes/crm/rag-crm.mjs --index

# Consulta RAG sobre conversaciones
node agentes/crm/rag-crm.mjs --ask "qué dijo María?"

# Sistema completo con supervisor
node agentes/index.mjs "usando el crm-agent, crea un deal para María"

# SERVIDOR CON CANALES REALES
node agentes/crm/crm-server.mjs                         # Todo: Express + WhatsApp QR + Instagram webhook
node agentes/crm/crm-server.mjs --no-whatsapp           # Solo Instagram
node agentes/crm/crm-server.mjs --no-instagram          # Solo WhatsApp
node agentes/crm/crm-server.mjs --seed                  # Forzar seed + arrancar
```

## 🎯 Para la entrevista: Cómo explicarlo

| Te preguntan | Tu respuesta |
|---|---|
| "¿Cómo construiste el CRM?" | "Sobre mi sistema multi-agente existente. Extendí el mismo patrón de LangGraph + StateGraph + ToolNode, pero con herramientas de negocio (contactos, deals, conversaciones) en vez de herramientas de archivos." |
| "¿Cómo funciona la persistencia?" | "Cada store hereda de BaseStore que serializa a JSON en disco. Al arrancar carga todo en memoria (Map), y cada operación CRUD persiste automáticamente." |
| "¿Y el RAG en el CRM?" | "Mismo pipeline que el RAG de código: all-MiniLM-L6-v2 + FAISS. Solo que ahora indexo las conversaciones en vez del código fuente. 384 dimensiones, hybrid search opcional." |
| "¿Cuánto tiempo tomó?" | "Las bases (agentes, RAG, supervisor) ~3 semanas. El CRM específico (modelos, stores, tools, datos demo) ~4 horas. La arquitectura de agentes es reusable." |
| "¿Cómo manejas canales reales?" | "WhatsApp via Baileys (WebSocket, QR auth multi-device). Instagram via Graph API webhook. El Bridge unifica ambos: recibe mensaje → identifica/crea contacto → busca conversación → invoca CRM Agent → responde automáticamente. Todo queda persistido en el CRM." |
| "¿Qué sigue?" | "Dashboards con analíticas en tiempo real, sistema de reglas/triggers para automatizaciones, y workflows multi-paso." |
