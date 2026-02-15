# Integrations

Documents how this package integrates with other packages in the workspace. This file captures cross-package dependencies, shared types, API contracts, and configuration patterns that span multiple repositories.

## Consumed APIs

APIs and services this package calls from other packages.

### [Package Name]

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/endpoint` | POST | Description of what this call does |

**Configuration:**
- `ENV_VAR_NAME`: URL to the service (default: `http://service:port`)

**Source**
- `path/to/client.go` - Client implementation

---

## Exposed APIs

APIs and interfaces this package provides to other packages.

### [API Name]

| Endpoint | Method | Consumers |
|----------|--------|-----------|
| `/api/endpoint` | GET | PackageA, PackageB |

**Source**
- `path/to/handler.go` - Handler implementation

---

## Shared Types

Types defined in this package that are used by other packages.

### [Type Name]

```go
type TypeName struct {
    Field1 string
    Field2 int
}
```

**Used by:**
- `PackageA` - For purpose X
- `PackageB` - For purpose Y

**Source**
- `path/to/types.go`

---

## Configuration Dependencies

Environment variables and configuration that must be coordinated across packages.

| Variable | This Package | Related Packages | Description |
|----------|--------------|------------------|-------------|
| `SERVICE_URL` | Consumer | Provider sets endpoint | URL for service communication |

---

## Integration Patterns

Common patterns for how this package integrates with the ecosystem.

### [Pattern Name]

Description of the integration pattern...

**Involved Packages:**
- `PackageA` - Role in pattern
- `PackageB` - Role in pattern

**Data Flow:**
```
PackageA → This Package → PackageB
```

**Source**
- `path/to/integration.go`

---

## Cross-Package Dependencies

Summary of workspace dependencies and their purposes.

| Dependency | Purpose | Types/APIs Used |
|------------|---------|-----------------|
| `PackageName` | Brief description | `TypeA`, `FunctionB` |

**Source**
- `go.mod` or `requirements.txt`
