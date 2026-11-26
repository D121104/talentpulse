# Backend Classes Integrated With AI Service

Class diagram for backend-owned entities and application classes that call or
prepare work for the FastAPI AI service. It focuses on CV parsing/matching,
generated CV drafts, candidate-assistant RAG, and job indexing.

```mermaid
classDiagram
    direction LR

    class User {
        +uuid _id
    }
    class Company {
        +uuid _id
    }
    class Job {
        +uuid _id
        +string title
        +boolean isDeleted
    }
    class Application {
        +uuid _id
        +uuid userId
        +uuid cvId
        +uuid jobId
        +boolean aiRankingConsentGranted
        +string aiRankingConsentVersion
        +string aiRankingConsentPolicyHash
        +Date aiRankingConsentAt
    }
    class UserCV {
        +uuid _id
        +uuid userId
        +string parseStatus
        +string contentHash
        +string contentVersion
        +string[] skills
        +string[] education
        +string[] experience
    }
    class CVMatchResult {
        +uuid _id
        +uuid cvId
        +uuid userId
        +uuid jobId
        +uuid applicationId
        +float matchScore
        +string status
        +jsonb components
        +string[] matchedSkills
        +string[] missingSkills
        +string scoringVersion
        +string normalizationVersion
    }
    class OnlineCV {
        +uuid _id
        +uuid userId
        +uuid targetJobId
        +string generationMode
        +jsonb generationSnapshot
        +jsonb revision
        +jsonb education
        +jsonb workExperience
        +jsonb skills
        +jsonb projects
    }
    class JobIndexOutbox {
        +uuid _id
        +uuid aggregateId
        +string aggregateType
        +string eventType
        +string sourceVersion
        +string representationVersion
        +string status
        +int attemptCount
    }

    class AiServiceClient {
        +parseCv(request)
        +matchCv(request)
        +analyzeMatch(request)
        +generateCvDraft(request)
        +retrieveRag(request)
        +generateRag(request)
        +upsertJob(request)
        +deleteJob(request)
    }
    class CVProcessingService {
        +enqueueEligibleApplication(applicationId)
        +queueCVProcessing(params)
        +getRankedCandidates(jobId)
    }
    class CVProcessingProcessor {
        +process(job)
    }
    class UserCVsService {
        +parseCV(cvId)
    }
    class JobIndexingService {
        +enqueue(jobId)
        +drain(maxOperations)
        +backfill(maxOperations)
    }
    class JobIndexingProcessor {
        +process(job)
    }
    class CandidateAssistantAiClient {
        +retrieve(request)
        +generate(request)
    }
    class ApplicationsService {
        +analyzeMatch(request)
    }
    class OnlineCVsService {
        +generateDraft(request)
        +reviewDraft(request)
    }
    class OnlineCvGenerationWorkerService {
        +process(job)
    }
    class CVParseRequest {
        <<DTO>>
    }
    class CVParseResponse {
        <<DTO>>
    }
    class MatchRequest {
        <<DTO>>
    }
    class MatchResponse {
        <<DTO>>
    }
    class CvDraftRequest {
        <<DTO>>
    }
    class CvDraftResponse {
        <<DTO>>
    }
    class CandidateAssistantAiRequest {
        <<DTO>>
    }
    class CandidateAssistantResponse {
        <<DTO>>
    }
    class JobIndexUpsertRequest {
        <<DTO>>
    }
    class JobIndexDeleteRequest {
        <<DTO>>
    }

    User "1" --> "0..*" UserCV : owns
    User "1" --> "0..*" OnlineCV : owns
    UserCV "1" <-- "0..*" Application : selected CV by ID
    Job "1" <-- "0..*" Application : applied job by ID
    User "1" <-- "0..*" Application : candidate by ID
    UserCV "1" <-- "0..*" CVMatchResult : matched CV
    Job "1" <-- "0..*" CVMatchResult : matched job
    User "1" <-- "0..*" CVMatchResult : candidate
    Application "0..1" <-- "0..*" CVMatchResult : source application
    Company "1" --> "0..*" Job : publishes
    Job "1" <-- "0..*" JobIndexOutbox : aggregateId, logical reference
    Job "0..1" <-- "0..*" OnlineCV : optional targetJobId

    UserCVsService ..> AiServiceClient : parse request
    AiServiceClient ..> CVParseRequest : sends
    AiServiceClient ..> CVParseResponse : validates response
    CVProcessingService --> CVProcessingProcessor : queues CV-processing work
    CVProcessingProcessor ..> AiServiceClient : CV match request
    AiServiceClient ..> MatchRequest : sends
    AiServiceClient ..> MatchResponse : validates response
    CVProcessingProcessor ..> CVMatchResult : persists match result
    CVProcessingService ..> Application : checks status and consent
    CVProcessingService ..> UserCV : checks ownership and parsed version
    CVProcessingService ..> Job : checks active job/version
    ApplicationsService ..> AiServiceClient : match analysis request
    ApplicationsService ..> CVMatchResult : reads persisted result

    OnlineCVsService --> OnlineCvGenerationWorkerService : queues generation
    OnlineCvGenerationWorkerService ..> AiServiceClient : generate/review draft
    AiServiceClient ..> CvDraftRequest : sends
    AiServiceClient ..> CvDraftResponse : validates response
    OnlineCvGenerationWorkerService ..> OnlineCV : persists approved result
    CandidateAssistantAiClient --> AiServiceClient : uses signed transport
    CandidateAssistantAiClient ..> CandidateAssistantAiRequest : builds RAG request
    CandidateAssistantAiClient ..> CandidateAssistantResponse : validates RAG result
    CandidateAssistantAiClient ..> UserCV : loads authorized CV context
    CandidateAssistantAiClient ..> Job : hydrates canonical job context
    CandidateAssistantAiClient ..> CVMatchResult : uses deterministic match evidence

    JobIndexingService ..> JobIndexOutbox : claims and updates events
    JobIndexingService --> JobIndexingProcessor : dispatches outbox work
    JobIndexingProcessor ..> Job : loads canonical job and company data
    JobIndexingProcessor ..> AiServiceClient : upsert/delete index request
    AiServiceClient ..> JobIndexUpsertRequest : sends
    AiServiceClient ..> JobIndexDeleteRequest : sends
```

`User`, `Company`, `Job`, `Application`, `UserCV`, `CVMatchResult`, `OnlineCV`
and `JobIndexOutbox` are backend domain/persistence classes. The request/response
classes are integration DTOs, not database entities. AI calls cross the
`AiServiceClient` HTTP boundary; FastAPI does not directly own the backend rows.

The links labelled “by ID” or “logical reference” are correlation/identity
relationships in backend logic. They are not all declared TypeORM foreign keys;
in particular, `JobIndexOutbox.aggregateId` references a job without a database
foreign-key relation. Candidate-assistant conversations/history are owned by
the backend product flow and are not depicted as AI-service persistence.
