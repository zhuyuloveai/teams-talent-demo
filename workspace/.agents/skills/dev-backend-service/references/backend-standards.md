# Backend architecture standards

- DDD layering: Application / Domain / Infrastructure / API
- Dependency direction: API → Application → Domain; Infrastructure implements Domain interfaces
- Business rules live in the Domain layer and are traceable to requirement IDs
- Unified error codes, logging standards, masking of sensitive data
- No circular dependencies; no calls that bypass layer boundaries
