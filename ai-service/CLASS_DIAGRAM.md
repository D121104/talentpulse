# AI Service Class Diagram

Sơ đồ lớp tập trung vào các thành phần chính của FastAPI: API/service theo
module, hợp đồng agent, và adapter hạ tầng. Schema request/response Pydantic
được thể hiện như DTO, không phải entity lưu trữ.

```mermaid
classDiagram
    direction LR

    class CVParser {
        +parse(request) CVParseResult
    }
    class MatchService {
        +match(request)
    }
    class MatchAnalysisService {
        +analyze(request)
    }
    class CareerChatAgent {
        +execute(request)
    }
    class RetrievalService {
        +retrieve(request) RagRetrieveResponse
    }
    class GenerationService {
        +generate(request) RagGenerateResponse
    }
    class JobIndexingService {
        +upsert(request)
        +delete(request)
    }
    class CvGenerationAgent {
        +generate(request)
    }

    class AgentDefinition {
        +name
        +description
        +tools
    }
    class AgentRequest {
        +task
        +context
    }
    class AgentResult {
        +status
        +output
        +usage
        +errors
    }
    class AgentExecutionState {
        <<TypedDict>>
    }
    class AgentModelPort {
        <<Protocol>>
        +invoke(request)
    }
    class AgentModelAdapter {
        +invoke(request)
    }
    class ToolRegistry {
        +register(tool)
        +get(name)
    }
    class ToolDispatcher {
        +dispatch(tool_call)
    }
    class ApprovalManager {
        +request_approval(request)
        +decide(request)
    }
    class ApprovalCheckpointPort {
        <<Protocol>>
        +get_checkpoint(approval_id)
        +delete_thread(approval_id)
    }
    class AgentCheckpointer {
        +get_checkpoint(approval_id)
        +delete_thread(approval_id)
        +cleanup_expired(now)
    }
    class ProviderBundle {
        +generation
        +embeddings
        +vector_retriever
    }
    class GenerationProvider {
        <<Protocol>>
        +generate(prompt)
    }
    class EmbeddingProvider {
        <<Protocol>>
        +embed_query(text)
    }
    class VectorRetriever {
        <<Protocol>>
        +search(vector, filter, limit)
    }
    class JobVectorWriter {
        <<Protocol>>
        +upsert_point(point_id, vector, payload)
        +delete_point(point_id)
    }
    class OllamaGenerationAdapter {
        +generate(prompt)
    }
    class BedrockNovaGenerationAdapter {
        +generate(prompt)
    }
    class GeminiGenerationAdapter {
        +generate(prompt)
    }
    class CohereEmbeddingAdapter {
        +embed_query(text)
    }
    class OllamaEmbeddingAdapter {
        +embed_query(text)
    }
    class QdrantVectorRetriever {
        +search(vector, filter, limit)
        +upsert_point(point_id, vector, payload)
        +delete_point(point_id)
    }

    class CVParseRequest {
        <<DTO>>
    }
    class CVProfile {
        <<DTO>>
    }
    class RagRetrieveRequest {
        <<DTO>>
    }
    class RagRetrieveResponse {
        <<DTO>>
    }
    class RagGenerateRequest {
        <<DTO>>
    }
    class RagGenerateResponse {
        <<DTO>>
    }
    class IndexJobUpsertRequest {
        <<DTO>>
    }
    class IndexJobResponse {
        <<DTO>>
    }
    class CvDraftRequest {
        <<DTO>>
    }
    class CvDraft {
        <<DTO>>
    }

    CVParser ..> CVParseRequest : accepts
    CVParser ..> CVProfile : returns parsed profile
    MatchService ..> CVProfile : matches profile
    MatchAnalysisService ..> CVProfile : analyzes profile
    CareerChatAgent ..> RetrievalService : retrieves evidence
    CareerChatAgent ..> GenerationService : generates answer
    RetrievalService ..> RagRetrieveRequest : accepts
    RetrievalService ..> RagRetrieveResponse : returns
    GenerationService ..> RagGenerateRequest : accepts
    GenerationService ..> RagGenerateResponse : returns
    JobIndexingService ..> IndexJobUpsertRequest : accepts
    JobIndexingService ..> IndexJobResponse : returns
    CvGenerationAgent ..> CvDraftRequest : accepts
    CvGenerationAgent ..> CvDraft : returns

    AgentDefinition --> AgentModelPort : model capability
    AgentModelPort <|.. AgentModelAdapter : implements
    AgentDefinition --> ToolRegistry : declares tools
    ToolRegistry --> ToolDispatcher : supplies definitions
    AgentRequest --> AgentExecutionState : initializes
    AgentExecutionState --> AgentResult : produces
    ApprovalManager --> ApprovalCheckpointPort : persists execution state
    ApprovalCheckpointPort <|.. AgentCheckpointer : implements
    CvGenerationAgent ..> AgentModelPort : uses structured model
    CareerChatAgent ..> AgentModelPort : uses model

    ProviderBundle --> GenerationProvider : provides
    ProviderBundle --> EmbeddingProvider : provides
    ProviderBundle --> VectorRetriever : provides
    GenerationProvider <|.. OllamaGenerationAdapter : implements
    GenerationProvider <|.. BedrockNovaGenerationAdapter : implements
    GenerationProvider <|.. GeminiGenerationAdapter : implements
    EmbeddingProvider <|.. CohereEmbeddingAdapter : implements
    EmbeddingProvider <|.. OllamaEmbeddingAdapter : implements
    VectorRetriever <|.. QdrantVectorRetriever : implements
    JobVectorWriter <|.. QdrantVectorRetriever : implements
    RetrievalService ..> VectorRetriever : retrieves vectors
    RetrievalService ..> EmbeddingProvider : embeds query
    GenerationService ..> GenerationProvider : generates text
    JobIndexingService ..> JobVectorWriter : writes/deletes index points
```

Lớp có `<<Protocol>>` là boundary/interface; adapter cụ thể được chọn qua
`ProviderBundle`/provider factory theo cấu hình. `AgentCheckpointer` lưu state
checkpoint trong schema PostgreSQL riêng; các DTO trong sơ đồ là hợp đồng
truyền dữ liệu, không phải các bản ghi database.
